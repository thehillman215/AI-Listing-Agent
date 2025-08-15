# AI Listing Agent - Real Estate Copy Generator

## Overview

This is a complete AI-powered real estate listing description generator that helps real estate professionals create compliant, optimized property descriptions. The application uses OpenAI to generate MLS descriptions, highlight bullets, and social media captions while ensuring Fair Housing compliance through automated guardrails and rewrite suggestions.

## Current Status - Enhanced AI Listing Agent
- ✓ Complete codebase uploaded and extracted
- ✓ Dependencies installed (Node.js v20, Express, SQLite, OpenAI, Stripe, etc.)
- ✓ Database initialized successfully with enhanced schema (10 tables)
- ✓ Enhanced generation service with AI variations and learning capabilities
- ✓ Smart property template system for different property types and markets
- ✓ Brand management system with market specialization profiles
- ✓ Batch processing capabilities for bulk property uploads and team workflows  
- ✓ Analytics dashboard for usage tracking and performance monitoring
- ✓ Enhanced frontend with tabbed navigation and modal interfaces
- ✓ Subscription tiers (Basic/Pro) with feature gating
- ✓ AI feedback system for continuous learning and improvement
- ✓ Multiple variation generation with user selection interface
- ✓ Production server improvements (graceful shutdown, error handling)
- ✓ Multiple health check endpoints (/health, /healthz, /ping)
- ✓ Enhanced deployment configuration optimized for production
- ✓ All enhanced features tested and working correctly
- ✓ API endpoints functional (templates, brands, analytics, batch, feedback)  
- ✓ Enhanced frontend with app-enhanced.js successfully deployed
- ✓ Professional styling with subscription tiers and Pro badges
- ✓ **DEPLOYMENT FIXES APPLIED**: Fixed run command, enhanced health checks, robust startup
- ✓ **DEPLOYMENT VERIFIED**: All health check endpoints (health/healthz/ping/ready) responding correctly
- ✅ **READY FOR PRODUCTION DEPLOYMENT** (August 15, 2025)

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Single Page Application (SPA)**: Built with vanilla HTML, CSS, and JavaScript for fast loading
- **Enhanced Navigation**: Multi-tab interface (Generator, Templates, Brands, Batch, Analytics, History, Billing)
- **Dark Theme**: Professional dark styling with gradient accents and Pro badges
- **Advanced Interface Components**: Modal dialogs, card layouts, progress bars, rating systems
- **Template & Brand Management**: Drag-and-drop interfaces for saving and reusing configurations
- **Batch Processing UI**: File upload with progress tracking and job status monitoring
- **Analytics Dashboard**: Interactive charts and metrics for usage insights
- **Variation Selection**: Multi-result interface with feedback collection system
- **Real-time Features**: Live character counters, copy buttons, download functionality, and progress indicators

### Backend Architecture
- **Runtime**: Node.js v20 with Express framework
- **Session Management**: Cookie-based sessions for user authentication
- **Rate Limiting**: Built-in rate limiting to prevent API abuse
- **Security**: Helmet middleware for security headers
- **API Structure**: RESTful endpoints for property generation, user management, and billing

### Data Storage
- **Database**: SQLite with better-sqlite3 for local persistence
- **File Location**: `data/app.db` (gitignored for security)
- **Schema Design**: Supports user accounts, credit tracking, generation history, and brand presets
- **MLS Ready**: Datasource interface prepared for future MLS feed integration

### Authentication & Authorization
- **Method**: Email and password authentication using bcryptjs for hashing
- **Session Management**: Express sessions with secure cookie configuration
- **Credit System**: User-based credit gating for AI generation requests
- **Guest Access**: Limited free credits for non-registered users

### AI Integration
- **Provider**: OpenAI API with configurable model selection
- **Two-Stage Process**:
  1. **Generation Stage**: Creates property copy using structured prompts with tone/length controls
  2. **Compliance Stage**: Reviews output for Fair Housing violations and suggests rewrites
- **Fallback Strategy**: Responses API with Chat Completions fallback
- **Output Format**: Structured JSON with MLS description, bullet points, and social captions

### Payment Processing
- **Provider**: Stripe Checkout for credit pack purchases
- **Webhook Integration**: Automatic credit fulfillment via Stripe webhooks
- **Credit Packs**: Multiple tiers (20/50/200 credits) with configurable pricing
- **Transaction History**: Purchase tracking and usage analytics

## External Dependencies

### Core Services
- **OpenAI API**: AI text generation and compliance checking
- **Stripe**: Payment processing and subscription management
- **Resend**: Optional email delivery service for results and notifications

### Key Libraries
- **better-sqlite3**: High-performance SQLite database driver
- **bcryptjs**: Password hashing and authentication
- **pdfkit**: PDF generation for marketing flyers
- **express-rate-limit**: API rate limiting and abuse prevention
- **helmet**: Security middleware for Express applications

### Configuration Requirements
- OpenAI API credentials for AI functionality
- Stripe API keys and webhook secrets for payments
- Session secrets for secure authentication
- Optional Resend API key for email features
- Configurable credit pricing and rate limits

## Deployment Configuration

### Applied Fixes (August 15, 2025)
- **✅ Fixed Deployment Run Command**: Changed from shell array format to direct npm start command
- **✅ Enhanced Health Check Endpoints**: Multiple robust endpoints (/health, /healthz, /ping, /ready)
- **✅ Database Connection Checks**: All health endpoints now verify database connectivity
- **✅ Comprehensive Health Response**: Detailed status including database, memory, and system info
- **✅ Production Configuration**: Enhanced replit.toml with proper deployment settings
- **✅ Robust Server Startup**: Added database initialization checks before server start
- **✅ Enhanced Error Handling**: Comprehensive error handling for uncaught exceptions and rejections
- **✅ Graceful Shutdown**: Proper cleanup with timeout protection
- **✅ Port Configuration**: Properly configured for PORT environment variable with explicit HOST=0.0.0.0
- **✅ Host Binding**: Uses 0.0.0.0 for container/cloud deployment compatibility
- **✅ Environment Variables**: Added placeholder environment variables in replit.toml
- **✅ Dependencies Fixed**: Resolved missing multer package dependency
- **✅ Verification Script**: Added deployment verification script for testing

### Deployment Files
- `replit.toml`: Primary deployment configuration with autoscale target
- `Dockerfile`: Container configuration for alternative deployment methods
- Multiple health check endpoints for various deployment systems

### Environment Variables Required
- SESSION_SECRET: ✓ Configured
- OPENAI_API_KEY: ✓ Configured  
- STRIPE_SECRET_KEY: ✓ Configured
- RESEND_API_KEY: ⚠ Optional (for email functionality)
- NODE_ENV: Set to 'production' in deployment config

## Project Cleanup (August 2025)

### Removed Deprecated Files
- **attached_assets/**: Removed entire directory containing old zip files and duplicate code
- **AI-Listing-Agent/**: Removed duplicate project directory 
- **backups/**: Removed backup directory with old billing.js versions
- **Development artifacts**: Removed cookies.txt, test_listing.pdf, and .bak files
- **Result**: Reduced project size from ~150MB to ~80MB, cleaner structure

### Current File Structure
```
├── server.js           # Main application server
├── package.json        # Dependencies and scripts  
├── src/               # Application modules
├── public/            # Frontend assets
├── scripts/           # Database and utility scripts
├── data/              # SQLite database
├── replit.toml        # Deployment configuration
├── Dockerfile         # Container configuration
└── stripe_prices.json # Live Stripe pricing data
```