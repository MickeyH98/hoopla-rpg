/**
 * Inventory Service
 * 
 * Handles inventory management, item naming, and item operations
 * for the RPG system.
 */

import { PlayerId, RPGPlayer } from './PlayerService';

/**
 * Service class for managing player inventories and items
 */
export class InventoryService {
  /**
   * Gets the proper display name for an item with rarity color
   * 
   * @param itemType - The item type to get display name for
   * @returns Formatted item name with color tags
   */
  getItemDisplayName(itemType: string): string {
    const item = itemType.toLowerCase();
    
    // Map ore types to proper display names with rarity colors
    switch (item) {
      case 'copper':
        return '<color="fff">[Copper Ore]</color>'; // White - Common
      case 'iron':
        return '<color="0f0">[Iron Ore]</color>'; // Green - Uncommon
      case 'gold':
        return '<color="08f">[Gold Ore]</color>'; // Blue - Rare
      case 'obsidian':
        return '<color="80f">[Obsidian Ore]</color>'; // Purple - Epic
      case 'diamond':
        return '<color="f80">[Diamond Ore]</color>'; // Orange - Legendary
      // Quest items - all standardized to yellow
      case 'brickingway box':
        return '<color="ff0">[Brickingway Box]</color>'; // Yellow - Quest Item
      case 'ice box':
        return '<color="ff0">[Ice Box]</color>'; // Yellow - Quest Item
      case 'ice chest':
        return '<color="ff0">[Ice Chest]</color>'; // Yellow - Quest Item
      // Gathering items
      case 'lavender':
        return '<color="fff">[Lavender]</color>'; // White - Common
      case 'red berry':
        return '<color="0f0">[Red Berry]</color>'; // Green - Uncommon
      default:
        return `<color="fff">[${itemType}]</color>`;
    }
  }

  /**
   * Gets the item name without color tags for inventory storage
   * 
   * @param itemType - The item type to get name for
   * @returns Clean item name without formatting
   */
  getItemName(itemType: string): string {
    const item = itemType.toLowerCase();
    
    // Map ore types to proper names
    switch (item) {
      case 'copper':
        return 'Copper Ore';
      case 'iron':
        return 'Iron Ore';
      case 'gold':
        return 'Gold Ore';
      case 'diamond':
        return 'Diamond Ore';
      case 'obsidian':
        return 'Obsidian Ore';
      default:
        return itemType;
    }
  }

  /**
   * Gets short item name from proper item name (for price lookup)
   * 
   * @param properItemName - The full item name
   * @returns Short version of the item name
   */
  getShortItemName(properItemName: string): string {
    const item = properItemName.toLowerCase();
    
    // Map proper names back to short names
    switch (item) {
      case 'copper ore':
        return 'copper';
      case 'iron ore':
        return 'iron';
      case 'gold ore':
        return 'gold';
      case 'diamond ore':
        return 'diamond';
      case 'obsidian ore':
        return 'obsidian';
      default:
        return properItemName;
    }
  }

  /**
   * Comprehensive item name normalization - fixes all malformed names
   * 
   * @param itemName - The item name to normalize
   * @returns Normalized item name
   */
  normalizeItemName(itemName: string): string {
    if (!itemName) return itemName;
    
    const normalized = itemName.trim();
    
    // Handle malformed mining messages
    if (normalized.startsWith('Mining ') && normalized.endsWith('...')) {
      const oreType = normalized.replace('Mining ', '').replace('...', '').toLowerCase();
      return this.getItemName(oreType);
    }
    
    // Handle direct malformed names
    switch (normalized.toLowerCase()) {
      case 'mining gold...':
        return 'Gold Ore';
      case 'mining diamond...':
        return 'Diamond Ore';
      case 'mining iron...':
        return 'Iron Ore';
      case 'mining copper...':
        return 'Copper Ore';
      case 'mining obsidian...':
        return 'Obsidian Ore';
      case 'obsidian':
        return 'Obsidian Ore';
      case 'gold':
        return 'Gold Ore';
      case 'iron':
        return 'Iron Ore';
      case 'copper':
        return 'Copper Ore';
      case 'diamond':
        return 'Diamond Ore';
      default:
        // Handle other malformed mining messages
        if (normalized.toLowerCase().startsWith('mining ') && normalized.toLowerCase().endsWith('...')) {
          const oreType = normalized.toLowerCase().replace('mining ', '').replace('...', '');
          console.log(`[Hoopla RPG] NORMALIZE DEBUG: Found malformed mining message "${normalized}", extracting ore type: "${oreType}"`);
          return this.getItemName(oreType);
        }
        
        // For properly named items, return as-is
        return normalized;
    }
  }

  /**
   * Cleans and normalizes an entire inventory array
   * 
   * @param inventory - The inventory array to normalize
   * @returns Normalized inventory array
   */
  normalizeInventory(inventory: string[]): string[] {
    if (!inventory || !Array.isArray(inventory)) {
      return [];
    }
    
    return inventory.map(item => this.normalizeItemName(item));
  }

  /**
   * Adds an item to a player's inventory
   * 
   * @param player - The player object to add item to
   * @param item - The item to add
   * @returns Updated inventory array
   */
  addToInventory(player: RPGPlayer, item: string): string[] {
    // Ensure inventory array exists
    if (!player.inventory) {
      player.inventory = [];
    }
    
    // Normalize the item name before adding to inventory
    const normalizedItem = this.normalizeItemName(item);
    player.inventory.push(normalizedItem);
    return player.inventory;
  }

  /**
   * Removes an item from a player's inventory
   * 
   * @param player - The player object to remove item from
   * @param item - The item to remove
   * @returns True if item was removed, false if not found
   */
  removeFromInventory(player: RPGPlayer, item: string): boolean {
    // Ensure inventory array exists
    if (!player.inventory) {
      player.inventory = [];
      return false;
    }
    
    const index = player.inventory.indexOf(item);
    if (index > -1) {
      player.inventory.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Removes an item from a player's inventory and saves to store
   * 
   * @param store - The store instance to save to
   * @param playerId - The player ID
   * @param item - The item to remove
   * @returns True if item was removed, false if not found
   */
  async removeFromInventoryAndSave(store: any, playerId: string, item: string): Promise<boolean> {
    try {
      // Get player data from store
      const playerData = await store.get(`player_${playerId}`) as any;
      if (!playerData) {
        return false;
      }

      // Remove item from inventory
      const removed = this.removeFromInventory(playerData, item);
      
      if (removed) {
        // Save updated player data back to store
        await store.set(`player_${playerId}`, playerData);
      }
      
      return removed;
    } catch (error) {
      return false;
    }
  }

  /**
   * Counts how many of a specific item a player has
   * 
   * @param player - The player object to count items for
   * @param item - The item to count
   * @returns Number of items the player has
   */
  countItem(player: RPGPlayer, item: string): number {
    if (!player.inventory || !Array.isArray(player.inventory)) {
      return 0;
    }
    
    return player.inventory.filter(inventoryItem => inventoryItem.toLowerCase() === item.toLowerCase()).length;
  }

  /**
   * Gets all unique items in a player's inventory with counts
   * 
   * @param player - The player object to get inventory for
   * @returns Object mapping item names to counts
   */
  getInventoryCounts(player: RPGPlayer): { [itemName: string]: number } {
    if (!player.inventory || !Array.isArray(player.inventory)) {
      return {};
    }
    
    const counts: { [itemName: string]: number } = {};
    for (const item of player.inventory) {
      counts[item] = (counts[item] || 0) + 1;
    }
    
    return counts;
  }

  /**
   * Removes multiple items of the same type from inventory
   * 
   * @param player - The player object to remove items from
   * @param item - The item to remove
   * @param amount - Number of items to remove
   * @returns Number of items actually removed
   */
  removeMultipleFromInventory(player: RPGPlayer, item: string, amount: number): number {
    if (!player.inventory || !Array.isArray(player.inventory)) {
      return 0;
    }
    
    let removed = 0;
    for (let i = player.inventory.length - 1; i >= 0 && removed < amount; i--) {
      if (player.inventory[i].toLowerCase() === item.toLowerCase()) {
        player.inventory.splice(i, 1);
        removed++;
      }
    }
    
    return removed;
  }


  /**
   * Formats item display with truncation for UI
   * 
   * @param itemCounts - Object mapping item names to counts
   * @param maxItems - Maximum number of items to show before truncating
   * @returns Formatted item display string
   */
  formatItemDisplay(itemCounts: { [key: string]: number }, maxItems: number = 8): string {
    const items = Object.entries(itemCounts);
    const shouldTruncate = items.length > maxItems;
    const itemsToShow = shouldTruncate ? items.slice(0, maxItems - 1) : items;
    
    return itemsToShow.map(([item, count]) => {
      const shortName = this.getShortItemName(item);
      return `<color="fff">[${shortName}]</color><color="ff0">x${count}</color>`;
    }).join(',');
  }
}
