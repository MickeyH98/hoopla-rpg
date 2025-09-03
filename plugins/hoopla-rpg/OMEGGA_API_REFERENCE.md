# Omegga API Reference - Confirmed Methods

## 🔍 **CONFIRMED OMEGGA METHODS**

### **Player Management**
- `this.omegga.getPlayer(name: string)` - Get player object by name
- `this.omegga.whisper(playerName: string, message: string)` - Send private message to player
- `this.omegga.broadcast(message: string)` - Send message to all players

### **Event Handling**
- `this.omegga.on(eventName: string, callback: Function)` - Register event listener
- `this.omegga.on("cmd:commandName", callback: Function)` - Register chat command
- `this.omegga.on("interact", callback: Function)` - Brick interaction events
- `this.omegga.on("*", callback: Function)` - Wildcard event listener

### **World Data**
- `this.omegga.getSaveData()` - Get world save data including all bricks
- `this.omegga.getClipboard()` - Get clipboard data (if available)

### **Brick Management**
- `this.omegga.clearRegion(region: { center: [x,y,z], extent: [x,y,z] }, options?: { target?: string | OmeggaPlayer })` - **✅ CONFIRMED - Correct method signature implemented**
  - **Usage**: Clears a region of bricks with exact dimensions
  - **Center**: Calculated as brick position + (brick size / 2) for precise targeting
  - **Extent**: Uses actual brick size properties (size, dimensions, or scale) for exact coverage
- `this.omegga.setBrick(position: [x,y,z], size: [x,y,z], color: [r,g,b,a], material: number, components: object)` - **❌ DOES NOT EXIST**
- `this.omegga.clearBrick(position: [x,y,z])` - **❌ DOES NOT EXIST**
- `this.omegga.setBrickVisible(position: [x,y,z], visible: boolean)` - **❌ DOES NOT EXIST**
- `this.omegga.setBrickColor(position: [x,y,z], color: [r,g,b,a])` - **❌ DOES NOT EXIST**
- `this.omegga.saveData(data: any)` - **❌ DOES NOT EXIST**

### **Player Template/Bounds (Unconfirmed)**
- `this.omegga.player.getTemplateBoundsData(playerName: string)` - **❌ DOES NOT EXIST**
- `this.omegga.player.getTemplateBounds(playerName: string)` - **❌ DOES NOT EXIST**

## 🚫 **METHODS WE'VE ATTEMPTED THAT DON'T EXIST**

1. **`setBrick()`** - Attempted to recreate mining nodes
2. **`clearBrick()`** - Attempted to remove depleted nodes  
3. **`setBrickVisible()`** - Attempted to toggle visibility
4. **`setBrickColor()`** - Attempted to change colors
5. **`saveData()`** - Attempted to save modified brick data
6. **`player.getTemplateBoundsData()`** - Attempted to get selected bricks

## 🔄 **METHODS CURRENTLY BEING TESTED**

*None currently - all methods have been tested and documented*

## ✅ **WORKING APPROACHES WE'VE CONFIRMED**

### **Brick Interaction Detection**
- Use `this.omegga.on("interact", callback)` with `data.player` and `data.position`
- Filter bricks by `Component_Interact` and `ConsoleTag` from `getSaveData()`

### **Visual Feedback (Current Implementation)**
- **Chat messages** for player feedback
- **Console logging** for debugging and status tracking
- **Timer-based cooldowns** for mining node regeneration

### **Data Persistence**
- `this.store.get()` and `this.store.set()` for plugin data
- `this.currency.add()` and `this.currency.getCurrency()` for currency

## 🔧 **ALTERNATIVE APPROACHES TO EXPLORE**

### **For Visual Brick Changes:**
1. **Component-based visibility** - Modify `Component_Interact` properties
2. **Material swapping** - Change brick materials instead of colors
3. **Size modification** - Scale bricks down to 0 for "invisible" effect
4. **Position shifting** - Move bricks far away temporarily

### **For Brick Selection:**
1. **Region-based detection** - Use player position + radius
2. **Component filtering** - Only process bricks with specific components
3. **Manual positioning** - Let players specify coordinates manually

## 📚 **SOURCES**

- **Omegga Core Documentation**: https://github.com/brickadia-community/omegga/blob/57ed0375b8a648f458cbb0ffa9a4c804455a6934/src/plugin.ts#L637
- **Minesweeper Plugin**: https://github.com/Meshiest/omegga-minesweeper/blob/master/omegga.plugin.js
- **Direct Testing**: All methods marked with ❌ have been tested and failed

## 🎯 **CURRENT WORKING SOLUTION**

Since we cannot directly modify brick appearance, we use:
- **Chat feedback** to inform players of node status
- **Console logging** to track cooldown states
- **Timer-based regeneration** for mining node availability
- **Inventory tracking** to show resource collection

This approach is reliable and doesn't depend on potentially non-existent brick modification methods.
