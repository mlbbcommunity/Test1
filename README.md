# WhatsApp Bot with Baileys - Enhanced Private Edition

A powerful WhatsApp bot built with the Baileys library, featuring enhanced privacy controls, dynamic command importing, and granular visibility management with dot prefix commands.

## 🚀 Features

- 🤖 **WhatsApp Bot**: Built with Baileys library for reliable WhatsApp Web API integration
- 🔐 **Code-based Pairing**: No QR code scanning required - uses pairing codes for authentication
- 🔒 **Private by Default**: Enhanced security with private-first command access
- 👑 **Role System**: Three-tier role system (Owner, Admin, User) with enhanced permissions
- 📦 **Dynamic Command Import**: Import custom commands directly via WhatsApp
- 👁️ **Visibility Management**: Granular control over command accessibility
- 🔌 **Plugin System**: Dynamic plugin loading for extensible functionality
- 📊 **Rich Commands**: Essential commands plus utility tools, admin features, and fun commands
- 🔄 **Auto Reconnection**: Handles connection drops and automatically reconnects
- 📝 **Comprehensive Logging**: Detailed logging with Pino for debugging and monitoring
- ☁️ **Deploy Ready**: Configured for easy deployment on Render platform

## 🏗️ Enhanced Architecture

### Private-First Security Model
- **Default Private Mode**: All commands are private by default
- **Explicit Public Access**: Commands must be explicitly made public
- **Role-Based Restrictions**: Enhanced permission system with visibility controls
- **Owner-Only Imports**: Only owners can import new commands for security

### Command Visibility System
- **Public Commands** (🌐): Accessible to all users (bypass role restrictions)
- **Private Commands** (🔒): Restricted by role permissions
- **Dynamic Control**: Real-time visibility management via `.zushi` and `.ope` commands

## 🎯 Core Commands

### Dynamic Command Management
- `.importcmd <name>` - Import custom commands via WhatsApp (Owner only)
- `.zushi <command>` - Make a command public/accessible to all (Owner only)
- `.ope <command>` - Make a command private/role-restricted (Admin+)
- `.visibility [list|reset]` - Manage command visibility settings (Admin+)
- `.cmdlist [remove <name>]` - List and manage imported commands (Owner only)

### Essential Commands (All Users)
- `.ping` - Check bot responsiveness and latency
- `.menu` - Display available commands with visibility indicators
- `.hello [name]` - Get a personalized greeting
- `.time` - Get current server time
- `.joke` - Get a random programming joke
- `.calc <expression>` - Perform mathematical calculations
- `.qr <text>` - Generate QR code for text
- `.quote` - Get an inspirational quote
- `.base64 <encode|decode> <text>` - Encode/decode base64
- `.password [length]` - Generate secure random password

### Admin Commands
- `.status` - Check bot status with visibility statistics
- `.plugins` - List all loaded plugins
- `.reloadplugin <filename>` - Reload a specific plugin
- `.loadplugins` - Reload all plugins
- `.info` - Get detailed system information

### Owner Commands
- `.addadmin @user` - Add a user as admin
- `.broadcast <message>` - Send message to recent contacts
- `.restart` - Restart the bot
- `.eval <code>` - Execute JavaScript code (debugging)

## 🔧 Installation & Setup

### 1. Environment Setup

Create a `.env` file in the root directory:

```env
# Bot Configuration
BOT_NAME=My WhatsApp Bot
PREFIX=.
PHONE_NUMBER=27683913716

# Owner Configuration (Your number)
OWNER_NUMBER=27683913716

# Admin Numbers (comma-separated, without + or spaces)
ADMIN_NUMBERS=27123456789,27987654321

# Enhanced Settings
PRIVATE_MODE=true
AUTO_READ=false
AUTO_TYPING=true
LOG_LEVEL=info
NODE_ENV=production
PORT=8000
