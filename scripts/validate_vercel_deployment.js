#!/usr/bin/env node
/**
 * Validation script for Vercel Next.js deployment
 * Tests the three required API endpoints per the deployment instructions
 */

async function testEndpoint(url, options = {}) {
  try {
    const response = await fetch(url, options);
    const data = await response.json();
    return {
      url,
      status: response.status,
      data,
      success: true
    };
  } catch (error) {
    return {
      url,
      status: 'ERROR',
      error: error.message,
      success: false
    };
  }
}

async function validateDeployment(baseUrl) {
  console.log(`🔍 Validating Vercel deployment at: ${baseUrl}`);
  console.log('=' .repeat(50));

  const tests = [
    {
      name: 'Health Check',
      test: () => testEndpoint(`${baseUrl}/api/health`),
      expected: { status: 200, hasOkField: true }
    },
    {
      name: 'Checkout Session (POST)',
      test: () => testEndpoint(`${baseUrl}/api/stripe/create-checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId: 'test' })
      }),
      expected: { status: 503, hasPaymentsEnabledField: true }
    },
    {
      name: 'Checkout Session (GET - should fail)',
      test: () => testEndpoint(`${baseUrl}/api/stripe/create-checkout-session`),
      expected: { status: 405 }
    },
    {
      name: 'Stripe Webhook',
      test: () => testEndpoint(`${baseUrl}/api/stripe/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'test.event' })
      }),
      expected: { status: 200, hasReceivedField: true }
    }
  ];

  let allPassed = true;
  
  for (const test of tests) {
    console.log(`\n📍 Testing: ${test.name}`);
    const result = await test.test();
    
    if (!result.success) {
      console.log(`❌ FAILED: ${result.error}`);
      allPassed = false;
      continue;
    }

    const statusMatch = result.status === test.expected.status;
    const fieldChecks = {
      hasOkField: test.expected.hasOkField ? !!result.data?.ok : true,
      hasPaymentsEnabledField: test.expected.hasPaymentsEnabledField ? 
        result.data?.payments_enabled === false : true,
      hasReceivedField: test.expected.hasReceivedField ? !!result.data?.received : true
    };

    const allFieldsPass = Object.values(fieldChecks).every(Boolean);

    if (statusMatch && allFieldsPass) {
      console.log(`✅ PASSED: ${result.status} - ${JSON.stringify(result.data)}`);
    } else {
      console.log(`❌ FAILED: Expected status ${test.expected.status}, got ${result.status}`);
      console.log(`   Response: ${JSON.stringify(result.data)}`);
      allPassed = false;
    }
  }

  console.log('\n' + '=' .repeat(50));
  if (allPassed) {
    console.log('🎉 ALL TESTS PASSED! Deployment is ready for Vercel.');
  } else {
    console.log('❌ Some tests failed. Please check the deployment configuration.');
  }
  
  return allPassed;
}

// Run validation if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const baseUrl = process.argv[2] || 'http://localhost:3000';
  validateDeployment(baseUrl)
    .then(success => process.exit(success ? 0 : 1))
    .catch(error => {
      console.error('Validation failed:', error);
      process.exit(1);
    });
}

export { validateDeployment };