# Omegga API Reference Documentation

This document contains the Omegga API interfaces and methods that are useful for implementing features in the Hoopla RPG plugin.

## BrickInteraction Interface

Created when a player clicks on a brick with an interact component.

```typescript
export interface BrickInteraction {
  /** Brick name from catalog (Turkey Body, 4x Cube) */
  brick_name: string;
  /** Brick asset name */
  brick_asset: string;
  /** Brick size */
  brick_size: [number, number, number];
  /** Player information, id, name, controller, and pawn */
  player: { id: string; name: string; controller: string; pawn: string };
  /** Brick center position */
  position: [number, number, number];
  /** message sent from a brick click interaction */
  message: string;
  /** data parsed from the line (if it starts with json:) */
  data: null | number | string | boolean | Record<string, unknown>;
  /** True when there was a json payload */
  json: boolean;
  /** True when there was a parse error */
  error: boolean;
}
```

## BrickBounds Interface

```typescript
export interface BrickBounds {
  minBound: [number, number, number];
  maxBound: [number, number, number];
  center: [number, number, number];
}
```

## OmeggaPlayer Interface

Key methods for player management and interactions:

### Item Management
- `giveItem(item: WeaponClass): void` - Gives a player an item
- `takeItem(item: WeaponClass): void` - Removes an item from player's inventory

### Health Management
- `kill(): void` - Kills the player
- `damage(amount: number): void` - Damages player
- `heal(amount: number): void` - Heals player

### Player State
- `getPosition(): Promise<[number, number, number]>` - Gets player position
- `isDead(pawn?: string): Promise<boolean>` - Checks if player is dead
- `isCrouched(pawn?: string): Promise<boolean>` - Checks if player is crouching

### Team and Game Management
- `setTeam(teamIndex: number): void` - Changes player's team
- `setMinigame(index: number): void` - Changes player's minigame
- `setScore(minigameIndex: number, score: number): void` - Sets player score
- `getScore(minigameIndex: number): Promise<number>` - Gets player score

### Brick Management
- `clearBricks(quiet?: boolean): void` - Clears player's bricks
- `loadBricks(saveName: string): void` - Load bricks on player's clipboard
- `loadSaveData(saveData: WriteSaveObject, options?): Promise<void>` - Load save data
- `getTemplateBounds(): Promise<BrickBounds>` - Gets template bounds
- `getTemplateBoundsData(): Promise<ReadSaveObject>` - Get bricks inside template bounds

### Player Information
- `getRoles(): readonly string[]` - Gets player roles
- `getPermissions(): Record<string, boolean>` - Gets player permissions
- `getNameColor(): string` - Gets player name color (6 char hex)
- `isHost(): boolean` - True if the player is the host
- `getPawn(): Promise<string>` - Get the player's pawn
- `getGhostBrick(): Promise<{targetGrid: string, location: number[], orientation: string}>` - Get ghost brick info
- `getPaint(): Promise<{materialIndex: string, materialAlpha: string, material: string, color: number[]}>` - Get paint tool properties

## StaticPlayer Interface

Static methods that take omegga instance and target as parameters:

### Item Management
- `giveItem(omegga: OmeggaLike, target: string | OmeggaPlayer, item: WeaponClass): void`
- `takeItem(omegga: OmeggaLike, target: string | OmeggaPlayer, item: WeaponClass): void`

### Health Management
- `kill(omegga: OmeggaLike, target: string | OmeggaPlayer): void`
- `damage(omegga: OmeggaLike, target: string | OmeggaPlayer, amount: number): void`
- `heal(omegga: OmeggaLike, target: string | OmeggaPlayer, amount: number): void`

### Team and Game Management
- `setTeam(omegga: OmeggaLike, target: string | OmeggaPlayer, teamIndex: number): void`
- `setMinigame(omegga: OmeggaLike, target: string | OmeggaPlayer, index: number): void`
- `setScore(omegga: OmeggaLike, target: string | OmeggaPlayer, minigameIndex: number, score: number): void`
- `getScore(omegga: OmeggaLike, target: string | OmeggaPlayer, minigameIndex: number): Promise<number>`

### Player Information
- `getRoles(omegga: OmeggaLike, id: string): readonly string[]`
- `getPermissions(omegga: OmeggaLike, id: string): Record<string, boolean>`

## AutoRestartConfig Type

```typescript
export type AutoRestartConfig = {
  players: boolean;
  announcement: boolean;
  saveWorld: boolean;
};
```

## WeaponClass Type

Used for item names like:
- "Weapon_Bow"
- "Weapon_LongSword" 
- "Weapon_HoloBlade"
- "Weapon_ArmingSword"
- "Weapon_Sabre"

## Usage Examples

### Giving Items to Players
```typescript
const player = this.omegga.getPlayer(playerId);
if (player) {
  player.giveItem('Weapon_LongSword');
}
```

### Removing Items from Players
```typescript
const player = this.omegga.getPlayer(playerId);
if (player) {
  player.takeItem('Weapon_LongSword');
}
```

### Static Method Usage
```typescript
// Using static methods
StaticPlayer.giveItem(this.omegga, playerId, 'Weapon_Bow');
StaticPlayer.takeItem(this.omegga, playerId, 'Weapon_Bow');
```

### Health Management
```typescript
const player = this.omegga.getPlayer(playerId);
if (player) {
  player.heal(50); // Heal 50 HP
  player.damage(25); // Damage 25 HP
  player.kill(); // Kill player
}
```

### Player State Checking
```typescript
const player = this.omegga.getPlayer(playerId);
if (player) {
  const isDead = await player.isDead();
  const isCrouched = await player.isCrouched();
  const position = await player.getPosition();
}
```

## Notes

- All async methods return Promises
- Player methods work on the specific player instance
- Static methods require passing the omegga instance and target
- WeaponClass is a string type for weapon item names
- Position coordinates are returned as [x, y, z] arrays
- Health methods work with numeric amounts
