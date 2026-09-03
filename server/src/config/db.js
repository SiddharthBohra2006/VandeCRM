const mongoose = require('mongoose');

// Handle post-connection database errors gracefully
mongoose.connection.on('error', (error) => {
  console.error('MongoDB connection error:', error.message);
  process.exit(1);
});

module.exports = async function connectDb() {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vande-agency-crm';
  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000
    });
    console.log('MongoDB connected');
  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
    process.exit(1);
  }
};
