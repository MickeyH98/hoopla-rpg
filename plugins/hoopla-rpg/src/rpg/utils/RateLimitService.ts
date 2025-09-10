/**
 * Rate Limiting Service
 * 
 * Provides modular rate limiting and autoclicker protection functionality
 * that can be used throughout the RPG system.
 */

import { OL } from "omegga";

export interface RateLimitConfig {
  maxClicksPerSecond: number;
  debounceMs: number;
}

/**
 * Service for handling rate limiting and autoclicker protection
 */
export class RateLimitService {
  private omegga: OL;
  private config: RateLimitConfig;
  
  // Rate limiting data
  private playerClickTimes: Map<string, number[]> = new Map();
  private lastInteractionTimes: Map<string, number> = new Map();

  constructor(omegga: OL, config?: Partial<RateLimitConfig>) {
    this.omegga = omegga;
    this.config = {
      maxClicksPerSecond: 10,
      debounceMs: 100,
      ...config
    };
  }

  /**
   * Check if a player can perform an interaction (rate limiting)
   * 
   * @param playerId - The ID of the player
   * @param interactionKey - Optional unique key for this specific interaction
   * @returns True if the player can interact, false if rate limited
   */
  canPlayerInteract(playerId: string, interactionKey?: string): boolean {
    const now = Date.now();
    const oneSecondAgo = now - 1000;
    const playerName = this.omegga.getPlayer(playerId)?.name || "Unknown Player";
    
    // Check debouncing for specific interactions
    if (interactionKey) {
      const lastInteractionTime = this.lastInteractionTimes.get(interactionKey) || 0;
      if (now - lastInteractionTime < this.config.debounceMs) {
        return false;
      }
      this.lastInteractionTimes.set(interactionKey, now);
    }
    
    // Get or create click times array for this player
    let clickTimes = this.playerClickTimes.get(playerId) || [];
    
    // Remove clicks older than 1 second
    clickTimes = clickTimes.filter(time => time > oneSecondAgo);
    
    // Check if player has exceeded rate limit (10 interactions per second)
    if (clickTimes.length >= this.config.maxClicksPerSecond) {
      // Simply return false - no bans, just rate limiting
      return false;
    }
    
    // Add current click time
    clickTimes.push(now);
    this.playerClickTimes.set(playerId, clickTimes);
    
    return true;
  }


  /**
   * Clean up old rate limiting data to prevent memory leaks
   */
  cleanupOldData(): void {
    const now = Date.now();
    
    // Clean up old click times (older than 1 minute)
    const oneMinuteAgo = now - (60 * 1000);
    for (const [playerId, clickTimes] of this.playerClickTimes.entries()) {
      const filteredTimes = clickTimes.filter(time => time > oneMinuteAgo);
      if (filteredTimes.length === 0) {
        this.playerClickTimes.delete(playerId);
      } else {
        this.playerClickTimes.set(playerId, filteredTimes);
      }
    }
    
    // Clean up old interaction times (older than 1 minute)
    for (const [interactionKey, lastTime] of this.lastInteractionTimes.entries()) {
      if (lastTime < oneMinuteAgo) {
        this.lastInteractionTimes.delete(interactionKey);
      }
    }
  }

  /**
   * Get rate limiting status for admin commands
   */
  getProtectionStatus(): {
    activePlayers: number;
    totalInteractions: number;
    players: Array<{ playerId: string; playerName: string; recentInteractions: number }>;
  } {
    const now = Date.now();
    const oneMinuteAgo = now - (60 * 1000);
    let totalInteractions = 0;
    const players: Array<{ playerId: string; playerName: string; recentInteractions: number }> = [];
    
    for (const [playerId, clickTimes] of this.playerClickTimes.entries()) {
      const playerName = this.omegga.getPlayer(playerId)?.name || "Unknown Player";
      const recentInteractions = clickTimes.filter(time => time > oneMinuteAgo).length;
      
      totalInteractions += recentInteractions;
      
      players.push({
        playerId,
        playerName,
        recentInteractions
      });
    }
    
    return {
      activePlayers: players.length,
      totalInteractions,
      players
    };
  }

  /**
   * Reset rate limiting data for a specific player or all players
   */
  resetProtectionData(playerId?: string): void {
    if (playerId) {
      // Reset specific player
      this.playerClickTimes.delete(playerId);
      // Clear all interaction times for this player
      for (const [key, time] of this.lastInteractionTimes.entries()) {
        if (key.startsWith(playerId + '_')) {
          this.lastInteractionTimes.delete(key);
        }
      }
    } else {
      // Reset all data
      this.playerClickTimes.clear();
      this.lastInteractionTimes.clear();
    }
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<RateLimitConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}
