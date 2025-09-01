import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function clearData() {
  try {
    console.log('🔄 Starting data cleanup...');
    
    // First, delete all products (due to foreign key constraints)
    console.log('🗑️  Deleting all products...');
    const deletedProducts = await prisma.product.deleteMany({});
    console.log(`✅ Deleted ${deletedProducts.count} products`);
    
    // Then delete all categories
    console.log('🗑️  Deleting all categories...');
    const deletedCategories = await prisma.category.deleteMany({});
    console.log(`✅ Deleted ${deletedCategories.count} categories`);
    
    console.log('🎉 Data cleanup completed successfully!');
    console.log(`📊 Summary: ${deletedProducts.count} products and ${deletedCategories.count} categories deleted`);
    
  } catch (error) {
    console.error('❌ Error during data cleanup:', error);
  } finally {
    await prisma.$disconnect();
  }
}

clearData();
