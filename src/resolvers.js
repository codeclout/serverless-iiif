const AWS = require('aws-sdk');
const URI = require('uri-js');
// const util = require('util');

// IIIF RESOLVERS

// Create input stream from S3 location
const s3Stream = async (location, callback) => {
  const s3 = new AWS.S3();
  const request = s3.getObject(location);
  const stream = request.createReadStream();
  try {
    return await callback(stream);
  } finally {
    stream.end().destroy();
    request.abort();
  }
};

// Create input stream from http location
const httpStream = async (location, callback) => {
  const result = await fetch(location);
  return await callback(result.body);
};

// Compute default stream location from ID
const defaultStreamLocation = (id) => {
  return `https://collections.nlm.nih.gov/jp2/${id}`;
  // return `http://imageserver/path/to/${id}.tif`;
};

// No metadata to read dimensions from; tell IIIF server to probe for size
const dimensionRetriever = async () => null;

// Compute default stream location from ID
// const defaultStreamLocation = (id) => {
//   const sourceBucket = process.env.tiffBucket;
//   const resolverTemplate = process.env.resolverTemplate || '%s.tif';
//   const replacementCount = resolverTemplate.match(/%.*?s/g).length;
//   const args = new Array(replacementCount).fill(id);
//   const key = util.format(resolverTemplate, ...args);

//   return { Bucket: sourceBucket, Key: key };
// };

// Retrieve dimensions from S3 metadata
// const dimensionRetriever = async (location) => {
//   const s3 = new AWS.S3();
//   const obj = await s3.headObject(location).promise();
//   if (obj.Metadata.width && obj.Metadata.height) {
//     return {
//       width: parseInt(obj.Metadata.width, 10),
//       height: parseInt(obj.Metadata.height, 10)
//     };
//   }
//   return null;
// };

// Preflight resolvers
const parseLocationHeader = (event) => {
  const locationHeader = event.headers['x-preflight-location'];
  if (locationHeader && locationHeader.match(/^s3:\/\//)) {
    const parsedURI = URI.parse(locationHeader);
    return { Bucket: parsedURI.host, Key: parsedURI.path.slice(1) };
  };
  return null;
};

const parseDimensionsHeader = (event) => {
  const dimensionsHeader = event.headers['x-preflight-dimensions'];
  if (!dimensionsHeader) return null;
  return JSON.parse(dimensionsHeader);
};

const preflightResolver = (event) => {
  const preflightLocation = parseLocationHeader(event);
  const preflightDimensions = parseDimensionsHeader(event);

  return {
    streamResolver: async ({ id }, callback) => {
      const location = preflightLocation || defaultStreamLocation(id);
      return s3Stream(location, callback);
    },
    dimensionResolver: async ({ id }) => {
      const location = preflightLocation || defaultStreamLocation(id);
      return preflightDimensions || dimensionRetriever(location);
    }
  };
};

// Standard (non-preflight) resolvers
const standardResolver = () => {
  return {
    streamResolver: async ({id, baseUrl}, callback) => {
      return s3Stream(defaultStreamLocation(id), callback);
    },
    dimensionResolver: async ({id, baseUrl}) => {
      return dimensionRetriever(defaultStreamLocation(id));
    }
  };
};

const resolverFactory = (event, preflight) => {
  return preflight ? preflightResolver(event) : standardResolver();
};

module.exports = { resolverFactory };
