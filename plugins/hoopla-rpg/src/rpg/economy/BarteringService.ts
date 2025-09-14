/**
 * Bartering Service
 * 
 * Handles bartering mechanics, multipliers, and trading calculations
 * for the RPG economy system.
 */

import { ResourceService } from './ResourceService';

/**
 * Service class for managing bartering and trading mechanics
 */
export class BarteringService {
  private resourceService: ResourceService;

  constructor(resourceService: ResourceService) {
    this.resourceService = resourceService;
  }

  /**
   * Calculates bartering multiplier based on skill level
   * 
   * @param barteringLevel - The player's bartering skill level
   * @returns The multiplier to apply to base prices
   */
  getBarteringMultiplier(barteringLevel: number): number {
    if (barteringLevel >= 30) return 2.5; // Max level = 2.5x
    if (barteringLevel >= 15) return 1.75; // Level 15-19 = 1.75x
    if (barteringLevel >= 10) return 1.5;  // Level 10-14 = 1.5x
    if (barteringLevel >= 5) return 1.25;  // Level 5-9 = 1.25x
    return 1.0; // Level 0-4 = 1x
  }

  /**
   * Calculates the final sell price with bartering bonus
   * 
   * @param basePrice - The base price of the item
   * @param barteringLevel - The player's bartering skill level
   * @returns The final price after applying bartering multiplier
   */
  calculateFinalPrice(basePrice: number, barteringLevel: number): number {
    const multiplier = this.getBarteringMultiplier(barteringLevel);
    return Math.floor(basePrice * multiplier);
  }

  /**
   * Calculates bartering XP based on item rarity and bartering skill level
   * 
   * @param itemName - The name of the item being sold
   * @param barteringLevel - The player's current bartering level
   * @returns The amount of bartering XP to award
   */
  calculateBarteringXP(itemName: string, barteringLevel: number): number {
    const rarity = this.resourceService.getResourceRarity(itemName);
    const baseXP = rarity * 10; // Increased base XP to make bartering more rewarding
    
    // Higher level players get less XP (diminishing returns)
    const levelPenalty = Math.max(0.1, 1 - (barteringLevel * 0.02));
    
    return Math.floor(baseXP * levelPenalty);
  }

  /**
   * Gets the bartering level required for a specific multiplier
   * 
   * @param targetMultiplier - The desired multiplier
   * @returns The minimum bartering level required
   */
  getLevelForMultiplier(targetMultiplier: number): number {
    if (targetMultiplier >= 2.5) return 30;
    if (targetMultiplier >= 1.75) return 15;
    if (targetMultiplier >= 1.5) return 10;
    if (targetMultiplier >= 1.25) return 5;
    return 0;
  }

  /**
   * Calculates the total value of items with bartering bonus
   * 
   * @param itemCounts - Object mapping item names to counts
   * @param barteringLevel - The player's bartering skill level
   * @returns Object containing total value and breakdown
   */
  calculateTotalValue(itemCounts: { [key: string]: number }, barteringLevel: number): {
    totalValue: number;
    baseValue: number;
    bonusValue: number;
    multiplier: number;
    breakdown: { [item: string]: { base: number; final: number; count: number } };
  } {
    const multiplier = this.getBarteringMultiplier(barteringLevel);
    let totalValue = 0;
    let baseValue = 0;
    const breakdown: { [item: string]: { base: number; final: number; count: number } } = {};

    for (const [item, count] of Object.entries(itemCounts)) {
      const basePrice = this.resourceService.getResourceSellPrice(item);
      const finalPrice = this.calculateFinalPrice(basePrice, barteringLevel);
      
      const itemBaseValue = basePrice * count;
      const itemFinalValue = finalPrice * count;
      
      baseValue += itemBaseValue;
      totalValue += itemFinalValue;
      
      breakdown[item] = {
        base: itemBaseValue,
        final: itemFinalValue,
        count: count
      };
    }

    const bonusValue = totalValue - baseValue;

    return {
      totalValue,
      baseValue,
      bonusValue,
      multiplier,
      breakdown
    };
  }

  /**
   * Formats a bartering bonus message
   * 
   * @param basePrice - The base price of the item
   * @param finalPrice - The final price after bartering
   * @param barteringLevel - The player's bartering level
   * @returns Formatted message showing the bartering bonus
   */
  formatBarteringBonus(basePrice: number, finalPrice: number, barteringLevel: number): string {
    const bonus = finalPrice - basePrice;
    const multiplier = this.getBarteringMultiplier(barteringLevel);
    
    if (bonus > 0) {
      return ` (+<color="0f0">${bonus}</color> bartering bonus, <color="ff0">${multiplier.toFixed(2)}x</color> multiplier)`;
    }
    
    return '';
  }

  /**
   * Gets the next bartering milestone
   * 
   * @param currentLevel - The player's current bartering level
   * @returns Information about the next milestone
   */
  getNextBarteringMilestone(currentLevel: number): {
    level: number;
    multiplier: number;
    levelsNeeded: number;
  } | null {
    const milestones = [
      { level: 5, multiplier: 1.25 },
      { level: 10, multiplier: 1.5 },
      { level: 15, multiplier: 1.75 },
      { level: 30, multiplier: 2.5 }
    ];

    for (const milestone of milestones) {
      if (currentLevel < milestone.level) {
        return {
          level: milestone.level,
          multiplier: milestone.multiplier,
          levelsNeeded: milestone.level - currentLevel
        };
      }
    }

    return null; // Max level reached
  }

  /**
   * Calculates the efficiency of bartering (bonus per level)
   * 
   * @param barteringLevel - The player's bartering level
   * @returns The efficiency rating (0-1)
   */
  getBarteringEfficiency(barteringLevel: number): number {
    const maxMultiplier = 2.5;
    const currentMultiplier = this.getBarteringMultiplier(barteringLevel);
    return (currentMultiplier - 1) / (maxMultiplier - 1);
  }

  /**
   * Gets bartering statistics for a player
   * 
   * @param barteringLevel - The player's bartering level
   * @returns Object containing various bartering statistics
   */
  getBarteringStats(barteringLevel: number): {
    currentMultiplier: number;
    efficiency: number;
    nextMilestone: { level: number; multiplier: number; levelsNeeded: number } | null;
    maxLevel: boolean;
  } {
    return {
      currentMultiplier: this.getBarteringMultiplier(barteringLevel),
      efficiency: this.getBarteringEfficiency(barteringLevel),
      nextMilestone: this.getNextBarteringMilestone(barteringLevel),
      maxLevel: barteringLevel >= 30
    };
  }
}
