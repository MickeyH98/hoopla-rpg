/**
 * Resource Service
 * 
 * Handles resource pricing, categorization, and display formatting
 * for the RPG economy system.
 */

import { InventoryService } from '../player/InventoryService';

/**
 * Service class for managing resource pricing and categorization
 */
export class ResourceService {
  private inventoryService: InventoryService;

  constructor(inventoryService: InventoryService) {
    this.inventoryService = inventoryService;
  }

  /**
   * Gets the sell price for different resources
   * 
   * @param resourceType - The type of resource to get price for
   * @returns The base sell price for the resource
   */
  getResourceSellPrice(resourceType: string): number {
    switch (resourceType.toLowerCase()) {
      // Mining resources
      case 'copper': return 1;
      case 'iron': return 3;
      case 'gold': return 10;
      case 'obsidian': return 25;
      case 'diamond': return 50;
      
      // Freshwater fish (spot)
      case 'gup': return 2;
      case 'cod': return 5;
      case 'shark': return 15;
      case 'whale': return 40;
      case 'kraken': return 75;
      
      // Deep ocean fish (spot_2)
      case 'sardine': return 2;
      case 'tuna': return 5;
      case 'marlin': return 15;
      case 'megalodon': return 40;
      case 'leviathan': return 75;
      
      // Tropical fish (spot_3)
      case 'clownfish': return 2;
      case 'angelfish': return 5;
      case 'lionfish': return 15;
      case 'manta ray': return 40;
      case 'sea dragon': return 75;
      
      // Arctic fish (spot_4)
      case 'icefish': return 2;
      case 'arctic char': return 5;
      case 'beluga': return 15;
      case 'narwhal': return 40;
      case 'frost kraken': return 75;
      
      // Quest items
      case 'brickingway box': return 0; // Quest items have no sell value
      case 'ice box': return 0;
      case 'ice chest': return 0;
      
      // Other items
      case 'fish bait': return 0; // Consumable, not sellable
      
      default: return 0;
    }
  }

  /**
   * Gets the color code for different resources based on rarity
   * 
   * @param resourceName - The name of the resource
   * @returns Hex color code for the resource
   */
  getResourceColor(resourceName: string): string {
    const resource = resourceName.toLowerCase();
    
    // Mining resources - handle both old and new formats
    if (resource === 'copper' || resource === 'copper ore') return 'fff';     // White (Common)
    if (resource === 'iron' || resource === 'iron ore') return '0f0';         // Green (Uncommon)
    if (resource === 'gold' || resource === 'gold ore') return '08f';         // Blue (Rare)
    if (resource === 'obsidian' || resource === 'obsidian ore') return '80f'; // Purple (Epic)
    if (resource === 'diamond' || resource === 'diamond ore') return 'f80';   // Orange (Legendary)
    
    // Fishing resources - Original freshwater fish
    if (resource === 'gup') return 'fff';           // White (Common)
    if (resource === 'cod') return '0f0';           // Green (Uncommon)
    if (resource === 'shark') return '08f';         // Blue (Rare)
    if (resource === 'whale') return '80f';         // Purple (Epic)
    if (resource === 'kraken') return 'f80';        // Orange (Legendary)
    
    // Deep ocean fish
    if (resource === 'sardine') return 'fff';       // White (Common)
    if (resource === 'tuna') return '0f0';          // Green (Uncommon)
    if (resource === 'marlin') return '08f';        // Blue (Rare)
    if (resource === 'megalodon') return '80f';     // Purple (Epic)
    if (resource === 'leviathan') return 'f80';     // Orange (Legendary)
    
    // Tropical fish
    if (resource === 'clownfish') return 'fff';     // White (Common)
    if (resource === 'angelfish') return '0f0';     // Green (Uncommon)
    if (resource === 'lionfish') return '08f';      // Blue (Rare)
    if (resource === 'manta ray') return '80f';     // Purple (Epic)
    if (resource === 'sea dragon') return 'f80';    // Orange (Legendary)
    
    // Arctic fish
    if (resource === 'icefish') return 'fff';       // White (Common)
    if (resource === 'arctic char') return '0f0';   // Green (Uncommon)
    if (resource === 'beluga') return '08f';        // Blue (Rare)
    if (resource === 'narwhal') return '80f';       // Purple (Epic)
    if (resource === 'frost kraken') return 'f80';  // Orange (Legendary)
    
    // Quest items - all standardized to yellow
    if (resource === 'brickingway box') return 'ff0'; // Yellow (Quest Item)
    if (resource === 'ice box') return 'ff0';         // Yellow (Quest Item)
    if (resource === 'ice chest') return 'ff0';       // Yellow (Quest Item)
    
    // Other items
    if (resource === 'fish bait') return 'ff0';       // Yellow (Consumable)
    
    // Default color for unknown items
    return 'fff'; // White
  }

  /**
   * Gets the category of a resource
   * 
   * @param resourceName - The name of the resource
   * @returns The category the resource belongs to
   */
  getResourceCategory(resourceName: string): string {
    const lowerItem = resourceName.toLowerCase();
    
    // Fish categories
    if (['gup', 'cod', 'shark', 'whale', 'kraken', 'sardine', 'tuna', 'marlin', 'megalodon', 'leviathan',
        'clownfish', 'angelfish', 'lionfish', 'manta ray', 'sea dragon', 'icefish', 'arctic char', 
        'beluga', 'narwhal', 'frost kraken'].includes(lowerItem)) {
      return 'fish';
    }
    
    // Ore categories
    if (['copper', 'copper ore', 'iron', 'iron ore', 'gold', 'gold ore', 'obsidian', 'obsidian ore', 
         'diamond', 'diamond ore'].includes(lowerItem)) {
      return 'ores';
    }
    
    // Quest item categories
    if (['brickingway box', 'ice box', 'ice chest'].includes(lowerItem)) {
      return 'quest';
    }
    
    // Other categories
    return 'other';
  }

  /**
   * Categorizes items for display purposes
   * 
   * @param itemCounts - Object mapping item names to counts
   * @returns Object with items categorized by type
   */
  categorizeItems(itemCounts: { [key: string]: number }): { [category: string]: { [item: string]: number } } {
    const categories: { [category: string]: { [item: string]: number } } = {
      fish: {},
      ores: {},
      quest: {},
      other: {}
    };

    for (const [item, count] of Object.entries(itemCounts)) {
      const category = this.getResourceCategory(item);
      categories[category][item] = count;
    }

    return categories;
  }

  /**
   * Formats item display with truncation for UI
   * 
   * @param itemCounts - Object mapping item names to counts
   * @param maxItems - Maximum number of items to show before truncating
   * @returns Formatted item display string
   */
  formatItemDisplay(itemCounts: { [key: string]: number }, maxItems: number = 8): string {
    const categories = this.categorizeItems(itemCounts);
    const displayParts: string[] = [];
    
    // Process each category
    for (const [categoryName, categoryItems] of Object.entries(categories)) {
      if (Object.keys(categoryItems).length === 0) continue;
      
      const categoryItemsArray = Object.entries(categoryItems);
      const shouldTruncate = categoryItemsArray.length > maxItems;
      const itemsToShow = shouldTruncate ? categoryItemsArray.slice(0, maxItems - 1) : categoryItemsArray;
      
      const categoryDisplay = itemsToShow.map(([item, count]) => {
        const itemColor = this.getResourceColor(item);
        const shortName = this.inventoryService.getShortItemName(item);
        return `<color="${itemColor}">[${shortName}]</color><color="ff0">x${count}</color>`;
      }).join(',');
      
      if (shouldTruncate) {
        const remainingCount = categoryItemsArray.length - (maxItems - 1);
        const totalRemaining = categoryItemsArray.slice(maxItems - 1).reduce((sum, [, count]) => sum + count, 0);
        categoryDisplay += `,<color="f80">+${remainingCount} more (${totalRemaining} items)</color>`;
      }
      
      displayParts.push(categoryDisplay);
    }
    
    return displayParts.join(',');
  }

  /**
   * Formats sell message with truncation for UI
   * 
   * @param itemCounts - Object mapping item names to counts
   * @param typeName - The type of items being sold (e.g., "fish", "ores")
   * @param totalValue - Formatted total value string
   * @param currency - Formatted currency string
   * @param xp - XP gained from selling
   * @param maxItems - Maximum number of items to show before truncating
   * @returns Formatted sell message
   */
  formatSellMessage(itemCounts: { [key: string]: number }, typeName: string, totalValue: string, currency: string, xp: number, maxItems: number = 6): string {
    const categories = this.categorizeItems(itemCounts);
    let message = `Sold all ${typeName} for ${totalValue}! `;
    
    // Show summary by category
    const categorySummaries: string[] = [];
    
    for (const [categoryName, categoryItems] of Object.entries(categories)) {
      if (Object.keys(categoryItems).length === 0) continue;
      
      const totalItems = Object.values(categoryItems).reduce((sum, count) => sum + count, 0);
      const itemTypes = Object.keys(categoryItems).length;
      
      if (itemTypes === 1) {
        const [item, count] = Object.entries(categoryItems)[0];
        const itemColor = this.getResourceColor(item);
        const shortName = this.inventoryService.getShortItemName(item);
        categorySummaries.push(`<color="ff0">x${count}</color> <color="${itemColor}">[${shortName}]</color>`);
      } else {
        categorySummaries.push(`<color="ff0">${totalItems} ${categoryName}</color> (${itemTypes} types)`);
      }
    }
    
    if (categorySummaries.length > 0) {
      message += `Items sold: ${categorySummaries.join(', ')}. `;
    }
    
    message += `You now have ${currency}. Gained ${xp} Bartering XP`;
    
    return message;
  }

  /**
   * Checks if a resource is a legendary item
   * 
   * @param resourceName - The name of the resource
   * @returns True if the resource is legendary
   */
  isLegendaryResource(resourceName: string): boolean {
    const legendaryItems = [
      'kraken', 'leviathan', 'sea dragon', 'frost kraken',
      'diamond', 'diamond ore'
    ];
    
    return legendaryItems.includes(resourceName.toLowerCase());
  }

  /**
   * Gets the rarity tier of a resource
   * 
   * @param resourceName - The name of the resource
   * @returns The rarity tier (1-5, where 5 is legendary)
   */
  getResourceRarity(resourceName: string): number {
    const resource = resourceName.toLowerCase();
    
    // Legendary (Tier 5)
    if (['kraken', 'leviathan', 'sea dragon', 'frost kraken', 'diamond', 'diamond ore'].includes(resource)) {
      return 5;
    }
    
    // Epic (Tier 4)
    if (['whale', 'megalodon', 'manta ray', 'narwhal', 'obsidian', 'obsidian ore'].includes(resource)) {
      return 4;
    }
    
    // Rare (Tier 3)
    if (['shark', 'marlin', 'lionfish', 'beluga', 'gold', 'gold ore'].includes(resource)) {
      return 3;
    }
    
    // Uncommon (Tier 2)
    if (['cod', 'tuna', 'angelfish', 'arctic char', 'iron', 'iron ore'].includes(resource)) {
      return 2;
    }
    
    // Common (Tier 1)
    return 1;
  }
}
