const mongoose = require('mongoose');
const Brand = require('../src/models/Brand');
const Post = require('../src/models/Post');
const User = require('../src/models/User');
const Media = require('../src/models/Media');
const AiVideoJob = require('../src/models/AiVideoJob');

async function cleanup() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ai-autobrand');
  const users = await User.find({ email: /^(smoke|flow)\d+@example\.com$/ }).select('_id');
  const ids = users.map((user) => user._id);

  await Promise.all([
    Post.deleteMany({ createdBy: { $in: ids } }),
    Media.deleteMany({ uploadedBy: { $in: ids } }),
    AiVideoJob.deleteMany({ createdBy: { $in: ids } }),
    Brand.deleteMany({ owner: { $in: ids } }),
    User.deleteMany({ _id: { $in: ids } })
  ]);

  console.log(`SMOKE_DATA_REMOVED=${ids.length}`);
  await mongoose.disconnect();
}

cleanup().catch((error) => {
  console.error(error);
  process.exit(1);
});
