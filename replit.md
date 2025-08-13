# AI Listing Agent - Real Estate Copy Generator

## Overview

This is a complete AI-powered real estate listing description generator that helps real estate professionals create compliant, optimized property descriptions. The application uses OpenAI to generate MLS descriptions, highlight bullets, and social media captions while ensuring Fair Housing compliance through automated guardrails and rewrite suggestions.

## Current Status
- ✓ Complete codebase uploaded and extracted
- ✓ Dependencies installed (Node.js v20, Express, SQLite, OpenAI, Stripe, etc.)
- ✓ Database initialized successfully (4 tables created)
- ✓ Syntax errors in server.js fixed
- ✓ OpenAI API key configured
- ✓ Server running successfully on port 3000
- ✓ Health check endpoint responding correctly
- ✓ JavaScript syntax errors fixed in frontend
- ✓ Full system tested and working (authentication, AI generation, exports, history)
- → Ready for testing and use

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Single Page Application (SPA)**: Built with vanilla HTML, CSS, and JavaScript for fast loading
- **Dark Theme**: Lightweight custom styling without external CSS frameworks
- **Modular Interface**: Organized into sections (Property Basics, Highlights, Style controls) with tabbed results panel
- **Real-time Features**: Live character counters, copy buttons, and download functionality

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