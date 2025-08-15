import { generateListing } from './generation.js';
import { updateBatchJob, getBatchJob } from './db.js';

export async function processBatchProperties(batchId, properties, userEmail) {
  try {
    const results = [];
    let completed = 0;
    
    // Update status to processing
    updateBatchJob(batchId, 'processing', 0, []);
    
    for (const property of properties) {
      try {
        // Add user context to each property
        const payload = {
          ...property,
          user: { email: userEmail },
          variations: 1 // Limit to 1 variation for batch processing
        };
        
        const result = await generateListing(payload);
        results.push({
          property: property.property || {},
          result: result.result,
          flags: result.flags,
          status: 'success',
          error: null
        });
        
        completed++;
        
        // Update progress every 5 properties or at the end
        if (completed % 5 === 0 || completed === properties.length) {
          updateBatchJob(batchId, 'processing', completed, results);
        }
        
        // Small delay to prevent rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        console.error(`Batch processing error for property:`, error);
        results.push({
          property: property.property || {},
          result: null,
          flags: [],
          status: 'error',
          error: error.message
        });
        completed++;
      }
    }
    
    // Mark as completed
    updateBatchJob(batchId, 'completed', completed, results);
    
    return { success: true, batchId, completed, total: properties.length };
    
  } catch (error) {
    console.error('Batch processing failed:', error);
    updateBatchJob(batchId, 'failed', completed || 0, results || []);
    throw error;
  }
}

export function validateBatchProperties(properties) {
  const errors = [];
  
  if (!Array.isArray(properties) || properties.length === 0) {
    errors.push('Properties array is required and cannot be empty');
    return errors;
  }
  
  if (properties.length > 50) {
    errors.push('Maximum 50 properties allowed per batch');
  }
  
  properties.forEach((prop, index) => {
    if (!prop.property?.address) {
      errors.push(`Property ${index + 1}: Address is required`);
    }
    if (!prop.property?.type) {
      errors.push(`Property ${index + 1}: Property type is required`);
    }
  });
  
  return errors;
}