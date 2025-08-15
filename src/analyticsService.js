import { getDb } from './db.js';

export function getAdminAnalytics(timeframe = '30d') {
  const db = getDb();
  
  // Parse timeframe
  const days = parseInt(timeframe.replace('d', '')) || 30;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startDateStr = startDate.toISOString().split('T')[0];
  
  // User metrics
  const userMetrics = db.prepare(`
    SELECT 
      COUNT(*) as total_users,
      COUNT(CASE WHEN last_login_at > datetime('now', '-7 days') THEN 1 END) as active_users_7d,
      COUNT(CASE WHEN last_login_at > datetime('now', '-30 days') THEN 1 END) as active_users_30d,
      AVG(credits) as avg_credits,
      SUM(credits) as total_credits
    FROM users
  `).get();
  
  // Generation metrics
  const generationMetrics = db.prepare(`
    SELECT 
      COUNT(*) as total_generations,
      COUNT(DISTINCT user_email) as unique_users,
      AVG(tokens_prompt) as avg_prompt_tokens,
      AVG(tokens_completion) as avg_completion_tokens,
      SUM(tokens_prompt + tokens_completion) as total_tokens
    FROM generation_jobs 
    WHERE created_at > ?
  `).get(startDateStr);
  
  // Revenue metrics
  const revenueMetrics = db.prepare(`
    SELECT 
      COUNT(*) as total_purchases,
      SUM(credits_added) as credits_sold,
      COUNT(DISTINCT user_email) as unique_buyers
    FROM billing_events 
    WHERE created_at > ?
  `).get(startDateStr);
  
  // Top users by activity
  const topUsers = db.prepare(`
    SELECT 
      user_email,
      COUNT(*) as generation_count,
      SUM(tokens_prompt + tokens_completion) as total_tokens,
      MAX(created_at) as last_generation
    FROM generation_jobs 
    WHERE created_at > ?
    GROUP BY user_email 
    ORDER BY generation_count DESC 
    LIMIT 10
  `).all(startDateStr);
  
  // Property type popularity
  const propertyTypes = db.prepare(`
    SELECT 
      JSON_EXTRACT(input_payload, '$.property.type') as property_type,
      COUNT(*) as count
    FROM generation_jobs 
    WHERE created_at > ? AND JSON_EXTRACT(input_payload, '$.property.type') IS NOT NULL
    GROUP BY property_type 
    ORDER BY count DESC
  `).all(startDateStr);
  
  // Daily activity trend
  const dailyActivity = db.prepare(`
    SELECT 
      DATE(created_at) as date,
      COUNT(*) as generations,
      COUNT(DISTINCT user_email) as unique_users
    FROM generation_jobs 
    WHERE created_at > ?
    GROUP BY DATE(created_at) 
    ORDER BY date DESC 
    LIMIT 30
  `).all(startDateStr);
  
  // Subscription distribution
  const subscriptionStats = db.prepare(`
    SELECT 
      plan,
      COUNT(*) as count
    FROM user_subscriptions 
    GROUP BY plan
  `).all();
  
  return {
    timeframe: `${days} days`,
    users: userMetrics,
    generations: generationMetrics,
    revenue: revenueMetrics,
    topUsers,
    propertyTypes,
    dailyActivity,
    subscriptions: subscriptionStats
  };
}

export function getUserAnalyticsData(email, limit = 50) {
  const db = getDb();
  
  // User's generation history with performance
  const generationHistory = db.prepare(`
    SELECT 
      id,
      created_at,
      tokens_prompt,
      tokens_completion,
      model,
      JSON_EXTRACT(input_payload, '$.property.type') as property_type,
      JSON_EXTRACT(input_payload, '$.property.address') as address
    FROM generation_jobs 
    WHERE user_email = ? 
    ORDER BY created_at DESC 
    LIMIT ?
  `).all(email, limit);
  
  // User's feedback ratings
  const feedbackStats = db.prepare(`
    SELECT 
      AVG(rating) as avg_rating,
      COUNT(*) as total_feedback,
      COUNT(CASE WHEN rating >= 4 THEN 1 END) as positive_feedback
    FROM generation_feedback 
    WHERE user_email = ?
  `).get(email);
  
  // Template usage
  const templateUsage = db.prepare(`
    SELECT 
      name,
      usage_count,
      created_at
    FROM property_templates 
    WHERE user_email = ? 
    ORDER BY usage_count DESC
  `).all(email);
  
  // Monthly usage trend
  const monthlyUsage = db.prepare(`
    SELECT 
      strftime('%Y-%m', created_at) as month,
      COUNT(*) as generations,
      SUM(tokens_prompt + tokens_completion) as total_tokens
    FROM generation_jobs 
    WHERE user_email = ? 
    GROUP BY strftime('%Y-%m', created_at) 
    ORDER BY month DESC 
    LIMIT 12
  `).all(email);
  
  return {
    generationHistory,
    feedbackStats,
    templateUsage,
    monthlyUsage
  };
}