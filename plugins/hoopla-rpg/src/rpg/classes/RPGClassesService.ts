/**
 * RPG Classes Service
 * 
 * Manages the RPG class system, including class definitions, selection,
 * and class-specific brick interactions.
 */

import { OL, PS } from 'omegga';

export interface RPGClass {
  id: string;
  name: string;
  description: string;
  emoji: string;
  startingEquipment: string[];
  specialBrickTypes: string[];
  classSpecificFeatures: string[];
}

export interface ClassSelection {
  classId: string;
  selectedAt: number; // timestamp
  classLevel: number; // class-specific level
  classXP: number; // class-specific experience
}

export class RPGClassesService {
  private omegga: OL;
  private store: PS<any>;

  // Class definitions
  private classes: { [classId: string]: RPGClass } = {
    warrior: {
      id: 'warrior',
      name: 'Warrior',
      description: 'Heavy melee combat specialist',
      emoji: '🗡️',
      startingEquipment: ['Zweihander'],
      specialBrickTypes: ['rpg_warrior_boulder'],
      classSpecificFeatures: ['Teleportation through boulder pushing', 'Strength-themed interactions']
    },
    mage: {
      id: 'mage',
      name: 'Mage',
      description: 'Magic and arcane knowledge specialist',
      emoji: '🧙‍♂️',
      startingEquipment: ['Holoblade'],
      specialBrickTypes: ['rpg_mage_portal'],
      classSpecificFeatures: ['Teleportation through magical portals', 'Arcane-themed interactions']
    },
    pirate: {
      id: 'pirate',
      name: 'Pirate',
      description: 'Naval combat and treasure hunting specialist',
      emoji: '🏴‍☠️',
      startingEquipment: ['Saber'],
      specialBrickTypes: ['rpg_pirate_treasure'],
      classSpecificFeatures: ['RNG money rewards', 'Treasure hunting interactions']
    }
  };

  constructor(omegga: OL, store: PS<any>) {
    this.omegga = omegga;
    this.store = store;
  }

  /**
   * Get all available classes
   */
  getAllClasses(): RPGClass[] {
    return Object.values(this.classes);
  }

  /**
   * Get a specific class by ID
   */
  getClass(classId: string): RPGClass | null {
    return this.classes[classId] || null;
  }

  /**
   * Get player's selected class
   */
  async getPlayerClass(playerId: string): Promise<RPGClass | null> {
    try {
      const classSelection = await this.store.get(`player_class_${playerId}`) as ClassSelection;
      if (!classSelection) {
        return null;
      }
      return this.getClass(classSelection.classId);
    } catch (error) {
      console.error(`[RPG Classes] Error getting player class for ${playerId}:`, error);
      return null;
    }
  }

  /**
   * Set player's class (permanent selection)
   */
  async setPlayerClass(playerId: string, classId: string): Promise<boolean> {
    try {
      const rpgClass = this.getClass(classId);
      if (!rpgClass) {
        console.error(`[RPG Classes] Invalid class ID: ${classId}`);
        return false;
      }

      const classSelection: ClassSelection = {
        classId: classId,
        selectedAt: Date.now(),
        classLevel: 1,
        classXP: 0
      };

      await this.store.set(`player_class_${playerId}`, classSelection);
      console.log(`[RPG Classes] Player ${playerId} selected class: ${rpgClass.name}`);
      return true;
    } catch (error) {
      console.error(`[RPG Classes] Error setting player class for ${playerId}:`, error);
      return false;
    }
  }

  /**
   * Check if player has selected a class
   */
  async hasPlayerSelectedClass(playerId: string): Promise<boolean> {
    const playerClass = await this.getPlayerClass(playerId);
    return playerClass !== null;
  }

  /**
   * Get player's class level and XP
   */
  async getPlayerClassLevel(playerId: string): Promise<{ level: number; xp: number } | null> {
    try {
      const classSelection = await this.store.get(`player_class_${playerId}`) as ClassSelection;
      if (!classSelection) {
        return null;
      }
      return {
        level: classSelection.classLevel || 1,
        xp: classSelection.classXP || 0
      };
    } catch (error) {
      console.error(`[RPG Classes] Error getting player class level for ${playerId}:`, error);
      return null;
    }
  }

  /**
   * Add class XP to player
   */
  async addClassXP(playerId: string, xpAmount: number): Promise<{ leveledUp: boolean; newLevel: number }> {
    try {
      const classSelection = await this.store.get(`player_class_${playerId}`) as ClassSelection;
      if (!classSelection) {
        console.error(`[RPG Classes] Player ${playerId} has no class selected`);
        return { leveledUp: false, newLevel: 1 };
      }

      const oldLevel = classSelection.classLevel || 1;
      classSelection.classXP = (classSelection.classXP || 0) + xpAmount;

      // Calculate new level (same XP scaling as main system)
      let newLevel = oldLevel;
      let xpForNextLevel = this.getXPForNextLevel(oldLevel);
      
      while (xpForNextLevel > 0 && classSelection.classXP >= xpForNextLevel && newLevel < 30) {
        newLevel++;
        xpForNextLevel = this.getXPForNextLevel(newLevel);
      }
      
      newLevel = Math.min(newLevel, 30);
      classSelection.classLevel = newLevel;

      await this.store.set(`player_class_${playerId}`, classSelection);
      
      const leveledUp = newLevel > oldLevel;
      if (leveledUp) {
        const rpgClass = this.getClass(classSelection.classId);
        const playerName = this.omegga.getPlayer(playerId)?.name || `Player_${playerId.substring(0, 8)}`;
        this.omegga.broadcast(`<color="ff0">${playerName} reached ${rpgClass?.name} Level ${newLevel}!</color>`);
      }

      return { leveledUp, newLevel };
    } catch (error) {
      console.error(`[RPG Classes] Error adding class XP for ${playerId}:`, error);
      return { leveledUp: false, newLevel: 1 };
    }
  }

  /**
   * Calculate XP needed for next level (same as main system)
   */
  private getXPForNextLevel(currentLevel: number): number {
    if (currentLevel >= 30) return 0;
    return Math.floor(100 * Math.pow(2, currentLevel - 1));
  }

  /**
   * Check if a brick type is class-specific
   */
  isClassSpecificBrick(brickType: string): boolean {
    for (const rpgClass of Object.values(this.classes)) {
      if (rpgClass.specialBrickTypes.includes(brickType)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get which class can interact with a specific brick type
   */
  getClassForBrickType(brickType: string): RPGClass | null {
    for (const rpgClass of Object.values(this.classes)) {
      if (rpgClass.specialBrickTypes.includes(brickType)) {
        return rpgClass;
      }
    }
    return null;
  }

  /**
   * Check if player can interact with a class-specific brick
   */
  async canPlayerInteractWithBrick(playerId: string, brickType: string): Promise<boolean> {
    const playerClass = await this.getPlayerClass(playerId);
    if (!playerClass) {
      return false;
    }
    return playerClass.specialBrickTypes.includes(brickType);
  }

  /**
   * Get class selection message for new players
   */
  getClassSelectionMessage(): string {
    let message = '<color="ff0">Choose your RPG Class:</color>\n\n';
    
    for (const rpgClass of Object.values(this.classes)) {
      message += `${rpgClass.emoji} <color="0ff">${rpgClass.name}</color>\n`;
      message += `<color="fff">${rpgClass.description}</color>\n`;
      message += `<color="ff0">Starting Equipment:</color> ${rpgClass.startingEquipment.join(', ')}\n\n`;
    }
    
    message += '<color="ff0">Use /rpg select [class] to choose your class!</color>\n';
    message += '<color="fff">Available classes: warrior, mage, pirate</color>';
    
    return message;
  }

  /**
   * Get class confirmation message
   */
  getClassConfirmationMessage(rpgClass: RPGClass): string {
    let message = `<color="0f0">Class Selected: ${rpgClass.emoji} ${rpgClass.name}</color>\n\n`;
    message += `<color="fff">${rpgClass.description}</color>\n\n`;
    message += '<color="ff0">Starting Equipment:</color>\n';
    
    for (const equipment of rpgClass.startingEquipment) {
      message += `• <color="0ff">${equipment}</color>\n`;
    }
    
    message += '\n<color="ff0">Special Features:</color>\n';
    for (const feature of rpgClass.classSpecificFeatures) {
      message += `• <color="0ff">${feature}</color>\n`;
    }
    
    message += '\n<color="0f0">Your class selection is permanent. Welcome to the RPG!</color>';
    
    return message;
  }

  /**
   * Get class-specific interaction message
   */
  getClassInteractionMessage(rpgClass: RPGClass, brickType: string): string {
    const brickName = brickType.replace('rpg_', '').replace(/_/g, ' ');
    return `<color="0f0">${rpgClass.emoji} ${rpgClass.name} Class Access</color>\n<color="fff">You can interact with ${brickName} nodes!</color>`;
  }

  /**
   * Get class denial message for wrong class
   */
  getClassDenialMessage(requiredClass: RPGClass, brickType: string): string {
    const brickName = brickType.replace('rpg_', '').replace(/_/g, ' ');
    return `<color="f00">Access Denied</color>\n<color="fff">Only ${requiredClass.emoji} ${requiredClass.name}s can interact with ${brickName} nodes.</color>`;
  }

  /**
   * Get player's class status message
   */
  async getPlayerClassStatus(playerId: string): Promise<string> {
    const playerClass = await this.getPlayerClass(playerId);
    
    if (!playerClass) {
      return '<color="ff0">No class selected</color>\n<color="fff">Use /rpg select [class] to choose your class!</color>';
    }
    
    const classLevel = await this.getPlayerClassLevel(playerId);
    const level = classLevel?.level || 1;
    
    let message = `<color="0f0">Your Class: ${playerClass.emoji} ${playerClass.name} Level ${level}</color>\n\n`;
    message += `<color="fff">${playerClass.description}</color>\n\n`;
    message += '<color="ff0">Special Brick Access:</color>\n';
    
    for (const brickType of playerClass.specialBrickTypes) {
      const brickName = brickType.replace('rpg_', '').replace(/_/g, ' ');
      message += `• <color="0ff">${brickName}</color>\n`;
    }
    
    return message;
  }

  /**
   * Get formatted class information for leaderboard display
   */
  async getPlayerClassDisplay(playerId: string): Promise<string> {
    const playerClass = await this.getPlayerClass(playerId);
    const classLevel = await this.getPlayerClassLevel(playerId);
    
    if (!playerClass || !classLevel) {
      return 'No Class';
    }
    
    return `${playerClass.name} L${classLevel.level}`;
  }
}
