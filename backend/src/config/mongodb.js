
const { MongoClient } = require('mongodb');

const clienteMongo = new MongoClient(
  process.env.MONGO_URI,
  {
    serverSelectionTimeoutMS: 5000
  }
);

const baseMongo = clienteMongo.db(
  process.env.MONGO_DB
);

module.exports = {
  clienteMongo,
  baseMongo
};
