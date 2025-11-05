const mongoose = require('mongoose');
const CostVersion = require('./models/CostVersion');

async function checkCostVersion() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/autovolt');
    console.log('Connected to MongoDB');
    
    const versions = await CostVersion.find({ is_active: true }).sort({ effective_from: -1 }).lean();
    
    console.log('='.repeat(60));
    console.log('ACTIVE COST VERSIONS:');
    console.log('='.repeat(60));
    
    if (versions.length === 0) {
      console.log('NO ACTIVE COST VERSIONS FOUND!');
      console.log('This is why the cost is showing ₹0.00');
      console.log('\nYou need to create a cost version.');
    } else {
      versions.forEach(v => {
        console.log('Cost per kWh: ₹', v.cost_per_kwh);
        console.log('Effective from:', v.effective_from);
        console.log('Effective until:', v.effective_until || 'Forever');
        console.log('Scope:', v.scope);
        console.log('Classroom:', v.classroom || 'All');
        console.log('-'.repeat(60));
      });
    }
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkCostVersion();
