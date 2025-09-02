# Installation Guide for Hoopla RPG Plugin

## Prerequisites

1. **Omegga Server**: You need a running Omegga server
2. **Currency Plugin**: The `currency` plugin must be installed and loaded first
3. **Node.js** (optional): For building from source

## Quick Installation

### Method 1: Direct Installation (Recommended)

1. Copy the entire `hoopla-rpg` folder to your server's `plugins/` directory
2. Ensure the `currency` plugin is already installed and loaded
3. Restart your Omegga server
4. The plugin should automatically load and register its commands

### Method 2: Build from Source

If you want to modify the plugin or build it yourself:

1. Install Node.js and npm from [nodejs.org](https://nodejs.org/)
2. Navigate to the plugin directory: `cd plugins/hoopla-rpg`
3. Install dependencies: `npm install`
4. Build the plugin: `npm run build`
5. Copy the `dist/` folder contents to your server

## Configuration

The plugin will work with default settings, but you can customize it by creating a config file:

1. Copy `config.example.yml` to your server's config directory
2. Modify the values as needed
3. Restart your server

## Verification

After installation, you should see these messages in your server console:

```
Hoopla RPG: Currency plugin loaded successfully!
```

And these commands should be available:
- `/rpg` - View your RPG stats
- `/balance` - Check your currency
- `/xp <amount>` - Gain experience
- And more...

## Troubleshooting

### Plugin Not Loading
- Check that the `currency` plugin is installed and loaded first
- Verify the plugin files are in the correct directory
- Check server console for error messages

### Commands Not Working
- Ensure the plugin loaded successfully
- Check that you have the required permissions
- Verify the plugin is listed in your server's plugin manager

### Currency Integration Issues
- Confirm the currency plugin is running
- Check that both plugins are in the same server instance
- Verify the currency plugin's configuration

## Support

If you continue to have issues:
1. Check the server console for error messages
2. Verify all dependencies are properly installed
3. Ensure file permissions are correct
4. Check the Omegga documentation for plugin development

## Commands Reference

### RPG Commands
- `/rpg` - Display RPG stats
- `/xp <amount>` - Add experience
- `/heal <amount>` - Heal player
- `/additem <item>` - Add to inventory
- `/removeitem <item>` - Remove from inventory
- `/inventory` - View inventory

### Currency Commands
- `/balance` - Check balance
- `/addmoney <amount>` - Add money
- `/spend <amount>` - Spend money

## File Structure

```
hoopla-rpg/
├── omegga.plugin.ts    # Main plugin file
├── currency.ts         # Currency API wrapper
├── plugin.json         # Plugin metadata
├── tsconfig.json       # TypeScript config
├── package.json        # Dependencies
├── README.md           # Documentation
├── INSTALL.md          # This file
├── config.example.yml  # Example configuration
└── build.sh            # Build script
```
