import OmeggaPlugin, { OL, PS, PC } from "omegga";
import Currency from "./currency";

// Import all services
import {
  MessagingService,
  ProgressBarService,
  InventoryService,
  PlayerService,
  ExperienceService,
  SkillService,
  ResourceService,
  BarteringService,
  QuestService,
  NodeService,
  DetectionService,
  TriggerService,
  WorldSaveService,
  MiningService,
  FishingService
} from "./src/rpg";

// Import class services
import {
  RPGClassesService,
  ClassInteractionService,
  ClassSelectionService
} from "./src/rpg/classes";

/**
 * HOOPLA RPG PLUGIN - MODULAR ARCHITECTURE
 * 
 * This plugin implements a clean, modular architecture where the main plugin
 * acts as a thin coordinator that delegates all functionality to specialized services.
 * 
 * Architecture:
 * - Main Plugin: Event handling, command routing, service coordination
 * - Services: Domain-specific business logic and data management
 * - Clean separation of concerns with dependency injection
 * 
 * Services:
 * - PlayerService: Player lifecycle and data management
 * - InventoryService: Inventory operations and item naming
 * - ExperienceService: XP and leveling system
 * - SkillService: Skill progression (mining, fishing, bartering)
 * - QuestService: Quest system and chain management
 * - ResourceService: Resource pricing and categorization
 * - BarteringService: Trading and bartering mechanics
 * - NodeService: World node interactions and triggers
 * - DetectionService: Auto-detection of world entities
 * - TriggerService: Brick trigger management
 * - WorldSaveService: Persistent world data
 * - MiningService: Mining mechanics and interactions
 * - FishingService: Fishing mechanics and interactions
 * - MessagingService: Long message handling
 * - ProgressBarService: Visual progress indicators
 */

// Type definitions
type Config = { 
  startingLevel: number; 
  startingHealth: number; 
  experienceMultiplier: number;
  healthRegenRate: number;
  maxLevel: number;
};

type Storage = { 
  [cur_uuid: string]: any;
};

type PlayerId = { id: string };

export default class Plugin implements OmeggaPlugin<Config, Storage> {
  omegga: OL;
  config: PC<Config>;
  store: PS<Storage>;
  currency: Currency;

  // Service instances
  private messagingService: MessagingService;
  private progressBarService: ProgressBarService;
  private inventoryService: InventoryService;
  private playerService: PlayerService;
  private experienceService: ExperienceService;
  private skillService: SkillService;
  private resourceService: ResourceService;
  private barteringService: BarteringService;
  private questService: QuestService;
  private nodeService: NodeService;
  private detectionService: DetectionService;
  private triggerService: TriggerService;
  private worldSaveService: WorldSaveService;
  private miningService: MiningService;
  private fishingService: FishingService;

  // Class services
  private classesService: RPGClassesService;
  private classInteractionService: ClassInteractionService;
  private classSelectionService: ClassSelectionService;

  // Rate limiting and autoclicker protection
  private playerClickTimes: Map<string, number[]> = new Map();
  private lastInteractionTimes: Map<string, number> = new Map();
  private playerViolations: Map<string, { count: number; lastViolation: number; bannedUntil?: number }> = new Map();

  constructor(omegga: OL, config: PC<Config>, store: PS<Storage>) {
    this.omegga = omegga;
    this.config = config;
    this.store = store;
    this.currency = new Currency(omegga);

    // Initialize services with proper dependencies
    this.messagingService = new MessagingService(omegga);
    this.progressBarService = new ProgressBarService();
    this.inventoryService = new InventoryService();
    this.playerService = new PlayerService(omegga, store, config);
    this.experienceService = new ExperienceService(omegga, store, config, new Map());
    this.skillService = new SkillService(omegga, store, config, new Map());
    this.resourceService = new ResourceService(this.inventoryService);
    this.barteringService = new BarteringService(this.resourceService);
    this.questService = new QuestService(omegga, store, this.messagingService, this.playerService, this.experienceService, this.inventoryService, this.resourceService, this.currency);
    this.nodeService = new NodeService(omegga, store, this.inventoryService, this.experienceService, this.skillService, this.resourceService, this.barteringService, this.progressBarService);
    this.detectionService = new DetectionService(omegga);
    this.triggerService = new TriggerService(omegga, store);
    this.worldSaveService = new WorldSaveService(omegga, store);
    this.miningService = new MiningService(omegga, this.inventoryService, this.experienceService, this.skillService, this.resourceService, this.progressBarService);
    this.fishingService = new FishingService(omegga, this.inventoryService, this.experienceService, this.skillService, this.resourceService, this.progressBarService);

    // Initialize class services
    this.classesService = new RPGClassesService(omegga, store);
    this.classInteractionService = new ClassInteractionService(omegga, store, this.classesService);
    this.classSelectionService = new ClassSelectionService(omegga, store, this.classesService);
  }

  async init() {
    console.log("[Hoopla RPG] Initializing modular RPG system...");
    
    // CRITICAL: Create data backup before initialization
    await this.createDataBackup();
    
    // Load the currency plugin
    try {
      await this.currency.loadPlugin();
      console.log("[Hoopla RPG] Currency plugin loaded successfully!");
    } catch (error) {
      console.error("[Hoopla RPG] Failed to load currency plugin:", error);
      console.log("[Hoopla RPG] Continuing without currency plugin...");
    }
    
    // Initialize services
    await this.initializeServices();
    
    // Set up event handlers
    this.setupEventHandlers();
    
    // Set up command handlers
    this.setupCommandHandlers();
    
    // Set up leaderboard announcement timer (every 10 minutes)
    setInterval(async () => {
      await this.announceLeaderboard();
    }, 10 * 60 * 1000); // 10 minutes in milliseconds

    // Set up autoclicker protection cleanup timer (every 5 minutes)
    setInterval(() => {
      this.cleanupAutoclickerData();
    }, 5 * 60 * 1000); // 5 minutes in milliseconds

    console.log("[Hoopla RPG] Modular RPG system initialized successfully!");
    console.log("[Hoopla RPG] Leaderboard announcements enabled - every 10 minutes");
    console.log("[Hoopla RPG] Autoclicker protection enabled with progressive penalties");

    // Generate a random hash for this reload to verify we're testing the correct version
    const reloadHash = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    // Announce plugin reload to all players with version hash
    this.omegga.broadcast(`<color="0f0">Hoopla RPG plugin has been reloaded successfully! [v${reloadHash}]</color>`);
    console.log(`Hoopla RPG: Plugin reload announcement sent to all players [v${reloadHash}]`);

    // Return registered commands for Omegga
    return { 
      registeredCommands: [
        "rpg", "rpginit", "rpghelp", "rpgclearall", "rpgcleartriggers", "rpgclearquests",
        "rpgresetquests", "rpgresetquestitems", "rpgassignlevel30roles", "rpgteams", "rpgcleaninventories", 
        "rpgcleaninventory", "rpginventory", "rpgnormalizeitems", "mininginfo", "fishinginfo", "rpgleaderboard",
        "rpgfixlevel", "rpgadmin", "rpgselect", "rpgantiautoclicker"
      ] 
    };
  }

  /**
   * Create a backup of all player data before initialization
   */
  private async createDataBackup(): Promise<void> {
    try {
      console.log("[Hoopla RPG] Creating data backup before initialization...");
      
      // Get all player data from store
      const allData = await this.store.get("rpg_*");
      const backupData: { [key: string]: any } = {};
      
      if (allData && typeof allData === 'object') {
        for (const [key, value] of Object.entries(allData)) {
          if (key.startsWith('rpg_')) {
            backupData[key] = value;
          }
        }
      }
      
      // Store backup with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupKey = `backup_${timestamp}`;
      await this.store.set(backupKey, backupData);
      
      console.log(`[Hoopla RPG] Data backup created: ${backupKey} (${Object.keys(backupData).length} players)`);
      
      // Clean up old backups (keep only last 5)
      await this.cleanupOldBackups();
      
    } catch (error) {
      console.error("[Hoopla RPG] Error creating data backup:", error);
      // Don't throw - backup failure shouldn't prevent initialization
    }
  }

  /**
   * Clean up old backups, keeping only the last 5
   */
  private async cleanupOldBackups(): Promise<void> {
    try {
      const allData = await this.store.get("*");
      if (!allData || typeof allData !== 'object') return;
      
      const backupKeys = Object.keys(allData)
        .filter(key => key.startsWith('backup_'))
        .sort()
        .reverse(); // Most recent first
      
      // Keep only the 5 most recent backups
      const keysToDelete = backupKeys.slice(5);
      
      for (const key of keysToDelete) {
        await this.store.delete(key);
        console.log(`[Hoopla RPG] Cleaned up old backup: ${key}`);
      }
      
    } catch (error) {
      console.error("[Hoopla RPG] Error cleaning up old backups:", error);
    }
  }

  /**
   * Initialize all services
   */
  private async initializeServices(): Promise<void> {
    try {
      // Services don't have initialize methods, they're ready to use
      console.log("[Hoopla RPG] All services initialized successfully");
    } catch (error) {
      console.error("[Hoopla RPG] Error initializing services:", error);
      throw error;
    }
  }

  /**
   * Set up event handlers
   */
  private setupEventHandlers(): void {
    // Player join/leave events
    this.omegga.on('join', (player) => {
      this.handlePlayerJoin(player);
    });

    this.omegga.on('leave', (player) => {
      this.handlePlayerLeave(player);
    });

    // Brick interaction events
    this.omegga.on('interact', (data: any) => {
      this.handleBrickInteraction(data);
    });

    console.log("[Hoopla RPG] Event handlers set up successfully");
  }

  /**
   * Set up command handlers
   */
  private setupCommandHandlers(): void {
    // RPG commands
    this.omegga.on('cmd:rpg', (speaker, ...args) => {
      this.handleRPGCommand(speaker, args);
    });

    // Additional RPG commands
    this.omegga.on('cmd:rpghelp', (speaker) => {
      this.showRPGHelp(speaker);
    });

    this.omegga.on('cmd:rpgleaderboard', (speaker) => {
      this.showLeaderboard(speaker);
    });

    this.omegga.on('cmd:rpginventory', (speaker) => {
      this.showPlayerInventory(speaker);
    });

    this.omegga.on('cmd:mininginfo', (speaker) => {
      this.showMiningInfo(speaker);
    });

    this.omegga.on('cmd:fishinginfo', (speaker) => {
      this.showFishingInfo(speaker);
    });

    // Class selection command
    this.omegga.on('cmd:rpgselect', (speaker, ...args) => {
      this.handleClassSelection(speaker, args);
    });

    // Additional RPG commands
    this.omegga.on('cmd:rpginit', (speaker) => {
      this.handleRPGInit(speaker);
    });

    this.omegga.on('cmd:rpgfixlevel', (speaker) => {
      this.handleRPGFixLevel(speaker);
    });

    this.omegga.on('cmd:rpgclearall', (speaker) => {
      this.handleRPGClearAll(speaker);
    });

    this.omegga.on('cmd:rpgcleartriggers', (speaker) => {
      this.handleRPGClearTriggers(speaker);
    });

    this.omegga.on('cmd:rpgclearquests', (speaker) => {
      this.handleRPGClearQuests(speaker);
    });

    this.omegga.on('cmd:rpgresetquests', (speaker) => {
      this.handleRPGResetQuests(speaker);
    });

    this.omegga.on('cmd:rpgresetquestitems', (speaker) => {
      this.handleRPGResetQuestItems(speaker);
    });

    this.omegga.on('cmd:rpgcleaninventory', (speaker) => {
      this.handleRPGCleanInventory(speaker);
    });

    this.omegga.on('cmd:rpgfixshopkeepers', (speaker) => {
      this.handleRPGFixShopkeepers(speaker);
    });

    this.omegga.on('cmd:rpgconvertbait', (speaker) => {
      this.handleRPGConvertBait(speaker);
    });

    this.omegga.on('cmd:rpgteams', (speaker) => {
      this.handleRPGTeams(speaker);
    });

    this.omegga.on('cmd:rpgassignlevel30roles', (speaker) => {
      this.handleRPGAssignLevel30Roles(speaker);
    });

    this.omegga.on('cmd:rpgcleaninventories', (speaker) => {
      this.handleRPGCleanInventories(speaker);
    });

    this.omegga.on('cmd:rpgnormalizeitems', (speaker) => {
      this.handleRPGNormalizeItems(speaker);
    });

    // Admin commands
    this.omegga.on('cmd:rpgadmin', (speaker, ...args) => {
      this.handleAdminCommand(speaker, args);
    });

    this.omegga.on('cmd:rpgantiautoclicker', (speaker, ...args) => {
      this.handleAntiAutoclickerCommand(speaker, args);
    });

    console.log("[Hoopla RPG] Command handlers set up successfully");
  }

  /**
   * Handle player join
   */
  private async handlePlayerJoin(player: any): Promise<void> {
    try {
      // Ensure player data exists by getting it (will create default if not exists)
      const playerData = await this.playerService.getPlayerData({ id: player.id });
      
      // Update username if needed
      await this.playerService.ensurePlayerUsername(player.id, player.name);
      
      // Check if player is level 30 and grant roles if needed
      if (playerData.level >= 30) {
        await this.ensureMaxLevelRoles(player.name);
      }
      
      console.log(`[Hoopla RPG] Player ${player.name} joined and data initialized`);
    } catch (error) {
      console.error(`[Hoopla RPG] Error handling player join for ${player.name}:`, error);
    }
  }

  /**
   * Handle player leave
   */
  private async handlePlayerLeave(player: any): Promise<void> {
    try {
      // Clean up any temporary data if needed
      console.log(`[Hoopla RPG] Player ${player.name} left`);
    } catch (error) {
      console.error(`[Hoopla RPG] Error handling player leave for ${player.name}:`, error);
    }
  }

  /**
   * Ensures a level 30+ player has the appropriate roles
   * 
   * @param playerName - The name of the player to check
   */
  private async ensureMaxLevelRoles(playerName: string): Promise<void> {
    try {
      console.log(`[Hoopla RPG] Ensuring max level roles for ${playerName}`);
      
      // Grant Flyer role
      await (this.omegga as any).setRole(playerName, "Flyer");
      console.log(`[Hoopla RPG] Ensured Flyer role for ${playerName}`);
      
      // Grant MINIGAME LEAVER role
      await (this.omegga as any).setRole(playerName, "MINIGAME LEAVER");
      console.log(`[Hoopla RPG] Ensured MINIGAME LEAVER role for ${playerName}`);
      
    } catch (error) {
      console.error(`[Hoopla RPG] Error ensuring max level roles for ${playerName}:`, error);
      // Don't throw - role granting failure shouldn't break player join
    }
  }

  /**
   * Clean up old autoclicker protection data to prevent memory leaks
   */
  private cleanupAutoclickerData(): void {
    const now = Date.now();
    const fiveMinutesAgo = now - (5 * 60 * 1000);
    
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
    
    // Clean up expired violations
    for (const [playerId, violation] of this.playerViolations.entries()) {
      // Remove violations that are older than 5 minutes and not currently banned
      if (violation.lastViolation < fiveMinutesAgo && (!violation.bannedUntil || violation.bannedUntil < now)) {
        this.playerViolations.delete(playerId);
      }
    }
    
    console.log(`[Hoopla RPG] Autoclicker protection data cleaned up`);
  }

  /**
   * Handle anti-autoclicker admin command
   */
  private handleAntiAutoclickerCommand(speaker: string, args: string[]): void {
    try {
      if (args.length === 0) {
        // Show status
        const now = Date.now();
        let activeBans = 0;
        let totalViolations = 0;
        
        for (const [playerId, violation] of this.playerViolations.entries()) {
          totalViolations += violation.count;
          if (violation.bannedUntil && violation.bannedUntil > now) {
            activeBans++;
          }
        }
        
        this.omegga.whisper(speaker, `<color="0ff">=== Autoclicker Protection Status ===</color>`);
        this.omegga.whisper(speaker, `<color="fff">Active bans: ${activeBans}</color>`);
        this.omegga.whisper(speaker, `<color="fff">Total violations tracked: ${totalViolations}</color>`);
        this.omegga.whisper(speaker, `<color="fff">Rate limit: 10 clicks/second</color>`);
        this.omegga.whisper(speaker, `<color="888">Use: /rpgantiautoclicker status|reset|reset [player]</color>`);
        
      } else if (args[0] === 'status') {
        // Detailed status
        const now = Date.now();
        this.omegga.whisper(speaker, `<color="0ff">=== Detailed Autoclicker Protection Status ===</color>`);
        
        for (const [playerId, violation] of this.playerViolations.entries()) {
          const playerName = this.omegga.getPlayer(playerId)?.name || "Unknown Player";
          const isBanned = violation.bannedUntil && violation.bannedUntil > now;
          const banTime = isBanned ? Math.ceil((violation.bannedUntil! - now) / 1000) : 0;
          
          this.omegga.whisper(speaker, `<color="fff">${playerName}: ${violation.count} violations${isBanned ? ` (BANNED ${banTime}s)` : ''}</color>`);
        }
        
      } else if (args[0] === 'reset') {
        if (args.length === 1) {
          // Reset all violations
          this.playerViolations.clear();
          this.playerClickTimes.clear();
          this.lastInteractionTimes.clear();
          this.omegga.whisper(speaker, `<color="0f0">All autoclicker protection data has been reset!</color>`);
        } else {
          // Reset specific player
          const targetPlayer = this.omegga.getPlayer(args[1]);
          if (targetPlayer) {
            this.playerViolations.delete(targetPlayer.id);
            this.playerClickTimes.delete(targetPlayer.id);
            // Clear all interaction times for this player
            for (const [key, time] of this.lastInteractionTimes.entries()) {
              if (key.startsWith(targetPlayer.id + '_')) {
                this.lastInteractionTimes.delete(key);
              }
            }
            this.omegga.whisper(speaker, `<color="0f0">Autoclicker protection data reset for ${targetPlayer.name}!</color>`);
          } else {
            this.omegga.whisper(speaker, `<color="f00">Player not found: ${args[1]}</color>`);
          }
        }
      } else {
        this.omegga.whisper(speaker, `<color="f00">Invalid command. Use: /rpgantiautoclicker [status|reset|reset player]</color>`);
      }
    } catch (error) {
      console.error(`[Hoopla RPG] Error handling anti-autoclicker command:`, error);
      this.omegga.whisper(speaker, `<color="f00">Error processing command: ${error.message}</color>`);
    }
  }

  /**
   * Handle brick interactions
   */
  private async handleBrickInteraction(data: any): Promise<void> {
      try {
        // Handle both old format (string) and new format (object) for player data
        const playerId = typeof data.player === 'string' ? data.player : data.player?.id;
        const playerName = typeof data.player === 'string' ? data.player : data.player?.name;
      
      console.log(`[DEBUG] Brick interaction received:`, {
        playerId,
        playerName,
        message: data.message,
        tag: data.tag,
        position: data.position,
        rawData: data
      });
        
        const player = this.omegga.getPlayer(playerId);
      if (!player) {
        console.log(`[DEBUG] Player not found for ID: ${playerId}`);
        return;
      }

        // Check click debounce - limit to 10 clicks per second
        if (!this.canPlayerClick(playerId)) {
          console.log(`[Hoopla RPG] Click rate limited for player ${playerName} (${playerId})`);
          return;
        }

        // Additional debouncing: prevent same interaction within 100ms
        const interactionKey = `${playerId}_${data.message}_${JSON.stringify(data.position)}`;
        const now = Date.now();
        const lastInteractionTime = this.lastInteractionTimes.get(interactionKey) || 0;
        
        if (now - lastInteractionTime < 100) {
          console.log(`[Hoopla RPG] Interaction debounced for player ${playerName} (${playerId})`);
          return;
        }
        
        this.lastInteractionTimes.set(interactionKey, now);

        // Store player username for leaderboard display
      await this.playerService.ensurePlayerUsername(player.id, player.name);

        // Check if this is an RPG console tag interaction
        if (data.message || data.tag) {
        console.log(`[DEBUG] RPG interaction detected - message: "${data.message}", tag: "${data.tag}"`);
        
        // Get the existing trigger data from the store
        // Create unique trigger ID by combining tag/message with position
        const baseId = data.tag || data.message;
        const position = data.position;
        console.log(`[DEBUG] Base ID: "${baseId}", Position:`, position);
        
        // Handle position data - it can be an array [x,y,z] or object {x,y,z}
        let positionString = '';
        if (position) {
          if (Array.isArray(position)) {
            positionString = `${position[0]},${position[1]},${position[2]}`;
          } else if (typeof position === 'object' && position.x !== undefined) {
            positionString = `${position.x},${position.y},${position.z}`;
          }
        }
        
        const triggerId = positionString ? `${baseId}_${positionString}` : baseId;
        console.log(`[DEBUG] Generated trigger ID: "${triggerId}"`);
        
        const triggers = await this.getBrickTriggers();
        let trigger = triggers[triggerId];
        console.log(`[DEBUG] Trigger lookup result:`, trigger ? 'FOUND' : 'NOT FOUND');
        if (trigger) {
          console.log(`[DEBUG] Existing trigger details:`, {
            id: trigger.id,
            type: trigger.type,
            message: trigger.message,
            position: trigger.position
          });
        }
        
        // If trigger doesn't exist, create a new one
        if (!trigger) {
          console.log(`[DEBUG] Creating new trigger for ID: "${triggerId}"`);
          const triggerType = this.determineTriggerType(data);
          
          // Log general brick interaction with node type and player name
          console.log(`[Hoopla RPG] ${playerName} interacted with ${triggerType} node: "${data.message || data.tag}"`);
          
          trigger = {
            id: triggerId,
            type: triggerType as any,
            value: 0,
            cooldown: 0,
            lastUsed: {},
            message: data.message,
            triggerType: 'click' as const,
            position: data.position,
            // Initialize fishing-specific properties
            nodeCooldown: {},
            fishingAttemptsRemaining: {},
            fishingProgress: {}
          };
          
          console.log(`[DEBUG] Created new trigger: "${triggerId}" with type: "${triggerType}" for message: "${data.message}"`);
          
          // Set appropriate values for shop triggers
          if (triggerType === 'buy' && data.message.includes('bait')) {
            trigger.value = 100; // Fish bait costs 100 currency
            console.log(`[DEBUG] Set bait price to 100 for trigger: "${triggerId}"`);
          } else if (triggerType === 'buy' && data.message.includes('saber')) {
            trigger.value = 5000; // Saber costs 5000 currency
            console.log(`[DEBUG] Set saber price to 5000 for trigger: "${triggerId}"`);
          }
      } else {
          // Check if existing trigger has the correct type
          const correctType = this.determineTriggerType(data);
          
          // Log general brick interaction with node type and player name
          console.log(`[Hoopla RPG] ${playerName} interacted with ${trigger.type} node: "${data.message || data.tag}"`);
          
          if (trigger.type !== correctType) {
            console.log(`[DEBUG] Correcting trigger type from "${trigger.type}" to "${correctType}"`);
            trigger.type = correctType as any;
            // Save the corrected trigger
            await this.saveTriggerData(trigger.id, trigger);
            console.log(`[DEBUG] Trigger type corrected and saved for: "${trigger.id}"`);
          }
        }

        // Get player data for service calls
        const playerData = await this.playerService.getPlayerData({ id: player.id });
        
        console.log(`[DEBUG] Trigger type determined: "${trigger.type}"`);
        console.log(`[DEBUG] Delegating to service for trigger type: "${trigger.type}"`);
        
        // Delegate to appropriate service based on trigger type
        switch (trigger.type) {
          case 'mining':
            await this.miningService.handleMiningNode(player.id, trigger.id, trigger, playerData);
            // CRITICAL: Save updated player data after mining interaction
            await this.playerService.setPlayerData({ id: player.id }, playerData);
            // Save updated trigger data
            await this.saveTriggerData(trigger.id, trigger);
            break;
          case 'fishing':
            const fishingResult = await this.fishingService.handleFishingNode(player.id, trigger.id, trigger, playerData);
            // CRITICAL: Save updated player data after fishing interaction
            await this.playerService.setPlayerData({ id: player.id }, playerData);
            // Save updated trigger data
            await this.saveTriggerData(trigger.id, trigger);
            break;
          case 'quest':
            console.log(`[DEBUG] Calling quest handler for trigger: "${trigger.id}"`);
            await this.questService.handleQuestInteraction(player.id, trigger);
            console.log(`[DEBUG] Quest handler completed for trigger: "${trigger.id}"`);
            break;
          case 'class_interaction':
            console.log(`[DEBUG] Calling class interaction handler for trigger: "${trigger.id}"`);
            await this.handleClassInteraction(player.id, trigger);
            console.log(`[DEBUG] Class interaction handler completed for trigger: "${trigger.id}"`);
            break;
          case 'questitem':
            console.log(`[DEBUG] Calling quest item handler for trigger: "${trigger.id}"`);
            await this.handleQuestItemInteraction(player.id, trigger);
            console.log(`[DEBUG] Quest item handler completed for trigger: "${trigger.id}"`);
            break;
          case 'buy':
            console.log(`[DEBUG] Calling buy handler for trigger: "${trigger.id}"`);
            await this.handleBuyInteraction(player.id, trigger);
            console.log(`[DEBUG] Buy handler completed for trigger: "${trigger.id}"`);
            break;
          case 'bulk_sell':
            console.log(`[DEBUG] Calling bulk sell handler for trigger: "${trigger.id}"`);
            await this.handleBulkSellInteraction(player.id, trigger);
            console.log(`[DEBUG] Bulk sell handler completed for trigger: "${trigger.id}"`);
            break;
          case 'shop':
            console.log(`[DEBUG] Calling shop handler for trigger: "${trigger.id}"`);
            await this.handleShopInteraction(player.id, trigger);
            console.log(`[DEBUG] Shop handler completed for trigger: "${trigger.id}"`);
            break;
      default:
            console.log(`[Hoopla RPG] Unknown trigger type: ${trigger.type}`);
        }
      }
    } catch (error) {
      console.error(`[Hoopla RPG] Error handling brick interaction:`, error);
    }
  }

  /**
   * Determine trigger type based on interaction data
   */
  private determineTriggerType(data: any): string {
    const message = data.message || data.tag || '';
    const lowerMessage = message.toLowerCase();
    
    
    // Check for specific shopkeeper types first (most specific)
    if (lowerMessage.includes('rpg_sell_all_fish') || lowerMessage.includes('rpg_sell_all_ores')) {
      console.log(`[DEBUG] Trigger type determined as: "bulk_sell"`);
      return 'bulk_sell';
    } else if (lowerMessage.includes('rpg_buy_')) {
      console.log(`[DEBUG] Trigger type determined as: "buy"`);
      return 'buy';
    } else if (lowerMessage.includes('questitem')) {
      console.log(`[DEBUG] Trigger type determined as: "questitem"`);
      return 'questitem';
    } else if (lowerMessage.includes('rpg_warrior_boulder') || lowerMessage.includes('rpg_mage_portal') || lowerMessage.includes('rpg_pirate_treasure')) {
      console.log(`[DEBUG] Trigger type determined as: "class_interaction"`);
      return 'class_interaction';
    } else if (lowerMessage.includes('quest') || lowerMessage.includes('npc')) {
      console.log(`[DEBUG] Trigger type determined as: "quest"`);
      return 'quest';
    } else if (lowerMessage.includes('mining') || lowerMessage.includes('ore')) {
      return 'mining';
    } else if (lowerMessage.includes('fishing') || lowerMessage.includes('fish')) {
      return 'fishing';
    } else if (lowerMessage.includes('shop')) {
      console.log(`[DEBUG] Trigger type determined as: "shop"`);
      return 'shop';
    }
    
    console.log(`[DEBUG] Trigger type determined as: "unknown"`);
    return 'unknown';
  }

  /**
   * Check if player can click (enhanced rate limiting with autoclicker protection)
   */
  private canPlayerClick(playerId: string): boolean {
    const now = Date.now();
    const oneSecondAgo = now - 1000;
    const playerName = this.omegga.getPlayer(playerId)?.name || "Unknown Player";
    
    // Check if player is temporarily banned for autoclicking
    const violation = this.playerViolations.get(playerId);
    if (violation?.bannedUntil && now < violation.bannedUntil) {
      const remainingSeconds = Math.ceil((violation.bannedUntil - now) / 1000);
      console.log(`[Hoopla RPG] AUTOCLICKER BAN: ${playerName} (${playerId}) is banned for ${remainingSeconds} more seconds`);
      return false;
    }
    
    // Get or create click times array for this player
    let clickTimes = this.playerClickTimes.get(playerId) || [];
    
    // Remove clicks older than 1 second
    clickTimes = clickTimes.filter(time => time > oneSecondAgo);
    
    // Check if player has exceeded rate limit (10 clicks per second)
    if (clickTimes.length >= 10) {
      // Record violation
      this.recordRateLimitViolation(playerId, playerName);
      return false;
    }
    
    // Add current click time
    clickTimes.push(now);
    this.playerClickTimes.set(playerId, clickTimes);
    
    return true;
  }

  /**
   * Record rate limit violation and apply progressive penalties
   */
  private recordRateLimitViolation(playerId: string, playerName: string): void {
    const now = Date.now();
    const violation = this.playerViolations.get(playerId) || { count: 0, lastViolation: 0 };
    
    // Reset violation count if it's been more than 5 minutes since last violation
    if (now - violation.lastViolation > 5 * 60 * 1000) {
      violation.count = 0;
    }
    
    violation.count++;
    violation.lastViolation = now;
    
    // Apply progressive penalties
    if (violation.count === 1) {
      console.log(`[Hoopla RPG] RATE LIMIT VIOLATION #1: ${playerName} (${playerId}) - Warning issued`);
    } else if (violation.count === 2) {
      console.log(`[Hoopla RPG] RATE LIMIT VIOLATION #2: ${playerName} (${playerId}) - 30 second cooldown applied`);
      violation.bannedUntil = now + (30 * 1000); // 30 second ban
    } else if (violation.count === 3) {
      console.log(`[Hoopla RPG] RATE LIMIT VIOLATION #3: ${playerName} (${playerId}) - 2 minute cooldown applied`);
      violation.bannedUntil = now + (2 * 60 * 1000); // 2 minute ban
    } else if (violation.count >= 4) {
      console.log(`[Hoopla RPG] RATE LIMIT VIOLATION #${violation.count}: ${playerName} (${playerId}) - 10 minute cooldown applied`);
      violation.bannedUntil = now + (10 * 60 * 1000); // 10 minute ban
    }
    
    this.playerViolations.set(playerId, violation);
    
    // Notify player of their penalty
    if (violation.bannedUntil) {
      const banDuration = Math.ceil((violation.bannedUntil - now) / 1000);
      this.omegga.whisper(playerId, `<color="f00">Rate limit exceeded! You are temporarily banned from interactions for ${banDuration} seconds.</color>`);
    }
  }

  /**
   * Handle quest item interactions
   */
  private async handleQuestItemInteraction(playerId: string, trigger: any): Promise<void> {
    try {
      console.log(`[DEBUG] Quest item interaction for player ${playerId}, trigger message: ${trigger.message}`);
      const questItemPlayer = await this.playerService.getPlayerData({ id: playerId });
      const questItemType = trigger.message; // e.g., "brickingway_box"
      
      // Ensure collectedBy is an array (fix for existing triggers)
      if (!trigger.collectedBy || !Array.isArray(trigger.collectedBy)) {
        trigger.collectedBy = [];
      }
      
      // Check if this player has already collected this specific quest item
      if (trigger.collectedBy.includes(playerId)) {
        const alreadyCollectedMessage = `You have already collected this ${questItemType.replace('_', ' ')}.`;
        this.omegga.middlePrint(playerId, alreadyCollectedMessage);
        return;
      }
      
      // Add the quest item to player's inventory
      const normalizedItemName = this.normalizeItemName(questItemType.replace('_', ' '));
      await this.inventoryService.addToInventory(questItemPlayer, normalizedItemName);
      await this.playerService.setPlayerData({ id: playerId }, questItemPlayer);
      
      // Mark this item as collected by this player
      trigger.collectedBy.push(playerId);
      await this.saveTriggerData(trigger.id, trigger);
      
      // Send success message with progress
      const itemColor = this.resourceService.getResourceColor(normalizedItemName);
      const progressMessage = await this.getQuestItemProgressMessage(playerId, normalizedItemName);
      this.omegga.middlePrint(playerId, progressMessage);
      
      console.log(`[DEBUG] Quest item ${questItemType} collected by player ${playerId}`);
      
    } catch (error) {
      console.error(`[Hoopla RPG] Error handling quest item interaction:`, error);
      this.omegga.whisper(playerId, "An error occurred processing the quest item interaction.");
    }
  }

  /**
   * Handle class-specific brick interactions
   */
  private async handleClassInteraction(playerId: string, trigger: any): Promise<void> {
    try {
      console.log(`[DEBUG] Class interaction for player ${playerId}, trigger message: ${trigger.message}`);
      
      // Check if this is a class-specific brick
      if (!this.classInteractionService.isClassInteraction(trigger.message)) {
        console.log(`[DEBUG] Not a class interaction: ${trigger.message}`);
        return;
      }
      
      // Handle the class interaction
      const result = await this.classInteractionService.handleClassInteraction(playerId, trigger.message);
      
      if (result.success) {
        this.omegga.middlePrint(playerId, result.message);
        
        // Handle any rewards
        if (result.reward) {
          if (result.reward.type === 'pirate_treasure' && result.reward.money) {
            // TODO: Add money to player's currency
            console.log(`[DEBUG] Pirate treasure reward: $${result.reward.money}`);
          }
        }
      } else {
        this.omegga.whisper(playerId, result.message);
      }
      
    } catch (error) {
      console.error(`[Hoopla RPG] Error handling class interaction:`, error);
      this.omegga.whisper(playerId, "An error occurred processing the class interaction.");
    }
  }

  /**
   * Handle shop interactions
   */
  private async handleShopInteraction(playerId: string, trigger: any): Promise<void> {
    try {
      switch (trigger.type) {
        case 'buy':
          await this.handleBuyInteraction(playerId, trigger);
          break;
        case 'bulk_sell':
          await this.handleBulkSellInteraction(playerId, trigger);
          break;
        default:
          console.log(`[Hoopla RPG] Unknown shop interaction type: ${trigger.type}`);
      }
    } catch (error) {
      console.error(`[Hoopla RPG] Error handling shop interaction:`, error);
    }
  }


  /**
   * Handle buy interactions
   */
  private async handleBuyInteraction(playerId: string, trigger: any): Promise<void> {
    try {
      const buyPlayer = await this.playerService.getPlayerData({ id: playerId });
      const buyType = trigger.message.replace('Shopkeeper: ', '');
      
      // Check if player has enough currency
      const currentCurrency = await this.getCurrencySafely(playerId);
      const itemPrice = trigger.value;
      
      if (currentCurrency < itemPrice) {
        const formattedPrice = await this.formatCurrencySafely(itemPrice);
        const formattedCurrent = await this.formatCurrencySafely(currentCurrency);
        const insufficientMessage = `Insufficient funds! You need ${formattedPrice} but only have ${formattedCurrent}.`;
        this.omegga.middlePrint(playerId, insufficientMessage);
        return;
      }
      
      // Deduct currency
      await this.addCurrencySafely(playerId, -itemPrice);
      
      // Add item based on type
      if (buyType === 'rpg_buy_bait') {
        await this.addConsumable({ id: playerId }, 'Fish bait', 20);
        const newCurrency = await this.getCurrencySafely(playerId);
        const formattedCurrency = await this.formatCurrencySafely(newCurrency);
        const formattedPrice = await this.formatCurrencySafely(itemPrice);
        
        const buyMessage = `Purchased <color="fff">[Fish bait]x20</color> for ${formattedPrice}! You now have ${formattedCurrency}.`;
        this.omegga.middlePrint(playerId, buyMessage);
      } else if (buyType === 'rpg_buy_saber') {
        // Give saber item to player
        const player = this.omegga.getPlayer(playerId);
        if (player) {
          player.giveItem('Weapon_Sabre');
        }
        
        const newCurrency = await this.getCurrencySafely(playerId);
        const formattedCurrency = await this.formatCurrencySafely(newCurrency);
        const formattedPrice = await this.formatCurrencySafely(itemPrice);
        
        const buyMessage = `Purchased <color="f80">[Saber]</color> for ${formattedPrice}! You now have ${formattedCurrency}.`;
        this.omegga.middlePrint(playerId, buyMessage);
      }
      
    } catch (error) {
      console.error(`[Hoopla RPG] Error handling buy interaction:`, error);
      this.omegga.whisper(playerId, "An error occurred while buying the item.");
    }
  }

  /**
   * Handle bulk sell interactions
   */
  private async handleBulkSellInteraction(playerId: string, trigger: any): Promise<void> {
    try {
      const bulkPlayer = await this.playerService.getPlayerData({ id: playerId });
      const bulkType = trigger.message;
      
      // Define which items to sell based on type
      let itemsToSell: string[] = [];
      if (bulkType === 'rpg_sell_all_fish' || bulkType.toLowerCase().includes('all_fish')) {
        itemsToSell = [
          'Gup', 'Cod', 'Shark', 'Whale', 'Kraken',
          'Sardine', 'Tuna', 'Marlin', 'Megalodon', 'Leviathan',
          'Clownfish', 'Angelfish', 'Lionfish', 'Manta Ray', 'Sea Dragon',
          'Icefish', 'Arctic Char', 'Beluga', 'Narwhal', 'Frost Kraken'
        ];
      } else if (bulkType === 'rpg_sell_all_ores' || bulkType.toLowerCase().includes('all_ores')) {
        itemsToSell = ['Copper Ore', 'Iron Ore', 'Gold Ore', 'Obsidian Ore', 'Diamond Ore'];
      }
      
      // Count items in inventory and calculate total value
      const itemCounts: { [key: string]: number } = {};
      let totalValue = 0;
      let totalItems = 0;
      
      for (const item of itemsToSell) {
        const count = bulkPlayer.inventory.filter(invItem => invItem.toLowerCase() === item.toLowerCase()).length;
        if (count > 0) {
          itemCounts[item] = count;
          const basePrice = this.resourceService.getResourceSellPrice(item);
          const barteringLevel = bulkPlayer.skills?.bartering?.level || 0;
          const barteringMultiplier = this.barteringService.getBarteringMultiplier(barteringLevel);
          const finalPrice = Math.floor(basePrice * barteringMultiplier);
          totalValue += finalPrice * count;
          totalItems += count;
        }
      }
      
      if (totalItems === 0) {
        this.omegga.middlePrint(playerId, `You don't have any ${bulkType.includes('fish') ? 'fish' : 'ores'} to sell.`);
        return;
      }
      
      // Remove all items from inventory
      const player = await this.playerService.getPlayerData({ id: playerId });
      for (const [item, count] of Object.entries(itemCounts)) {
        for (let i = 0; i < count; i++) {
          await this.inventoryService.removeFromInventory(player, item);
        }
      }
      
      // CRITICAL: Save the updated player data after removing items
      await this.playerService.setPlayerData({ id: playerId }, player);
      
      // Add currency and XP
      await this.addCurrencySafely(playerId, totalValue);
      await this.skillService.addSkillExperience({ id: playerId }, 'bartering', totalItems);
      
      const newCurrency = await this.getCurrencySafely(playerId);
      const formattedCurrency = await this.formatCurrencySafely(newCurrency);
      const formattedValue = await this.formatCurrencySafely(totalValue);
      const bulkMessage = `Sold ${totalItems} ${bulkType.includes('fish') ? 'fish' : 'ores'} for ${formattedValue}! You now have ${formattedCurrency}. Gained ${totalItems} Bartering XP`;
      
      this.omegga.middlePrint(playerId, bulkMessage);
      
    } catch (error) {
      console.error(`[Hoopla RPG] Error handling bulk sell interaction:`, error);
      this.omegga.whisper(playerId, "An error occurred while selling items in bulk.");
    }
  }

  /**
   * Handle RPG commands
   */
  private async handleRPGCommand(speaker: string, args: string[]): Promise<void> {
    try {
      if (args.length === 0) {
        // Default behavior: show player stats (matches original)
        await this.showPlayerStats(speaker);
        return;
      }

      const command = args[0].toLowerCase();
      
      switch (command) {
        case 'stats':
          await this.showPlayerStats(speaker);
          break;
        case 'inventory':
          await this.showPlayerInventory(speaker);
          break;
        case 'leaderboard':
          await this.showLeaderboard(speaker);
          break;
        case 'help':
          await this.showRPGHelp(speaker);
          break;
        default:
          this.omegga.whisper(speaker, `Unknown command: ${command}. Use /rpg help for available commands.`);
      }
    } catch (error) {
      console.error(`[Hoopla RPG] Error handling RPG command:`, error);
      this.omegga.whisper(speaker, "An error occurred processing your command.");
    }
  }

  /**
   * Handle admin commands
   */
  private async handleAdminCommand(speaker: string, args: string[]): Promise<void> {
    try {
      // TODO: Implement admin command logic
      this.omegga.whisper(speaker, "Admin commands not yet implemented in new architecture.");
    } catch (error) {
      console.error(`[Hoopla RPG] Error handling admin command:`, error);
      this.omegga.whisper(speaker, "An error occurred processing your admin command.");
    }
  }

  /**
   * Show RPG help
   */
  private async showRPGHelp(speaker: string): Promise<void> {
    const helpMessage = `
<color="ff0">=== HOOPLA RPG HELP ===</color>

<color="0f0">Available Commands:</color>
/rpg stats - Show your character stats
/rpg inventory - Show your inventory
/rpg leaderboard - Show the leaderboard
/rpg help - Show this help message

<color="0f0">Game Features:</color>
- Mining nodes for ores and XP
- Fishing spots for fish and XP
- Quest system with rewards
- Skill progression (Mining, Fishing, Bartering)
- Economy and trading system

<color="0f0">How to Play:</color>
1. Find mining nodes (colored bricks) and click them to mine
2. Find fishing spots and click them to fish
3. Complete quests for rewards
4. Level up your skills and character
5. Trade resources for currency

<color="ff0">Good luck, adventurer!</color>
    `.trim();

    this.messagingService.sendLongMessage(speaker, helpMessage);
  }

  /**
   * Show player stats
   */
  private async showPlayerStats(speaker: string): Promise<void> {
    try {
      const player = this.omegga.getPlayer(speaker);
      if (!player) return;

      const rpgData = await this.playerService.getPlayerData({ id: player.id });
      
      // Get currency with fallback if currency plugin is not available
      const currency = await this.getCurrencySafely(player.id);
      const formattedCurrency = await this.formatCurrencySafely(currency);

      // Ensure all required properties exist with fallbacks
      const safeRpgData = {
        level: rpgData.level ?? 1,
        experience: rpgData.experience ?? 0,
        health: rpgData.health ?? 100,
        maxHealth: rpgData.maxHealth ?? 100,
        inventory: rpgData.inventory ?? [],
        nodesCollected: rpgData.nodesCollected ?? [],
        consumables: rpgData.consumables ?? [],
        skills: rpgData.skills ?? {
          mining: { level: 0, experience: 0 },
          bartering: { level: 0, experience: 0 },
          fishing: { level: 0, experience: 0 }
        }
      };
      
      // Count items by type for better display
      const itemCounts: { [key: string]: number } = {};
      for (const item of safeRpgData.inventory) {
        itemCounts[item] = (itemCounts[item] || 0) + 1;
      }
      
      // Log grouped inventory items
      console.log(`[Hoopla RPG] ${player.name} inventory:`);
      if (Object.keys(itemCounts).length === 0) {
        console.log(`  (empty)`);
    } else {
        for (const [item, count] of Object.entries(itemCounts)) {
          console.log(`  ${item}: ${count}`);
        }
      }
      
      // DEBUG: Output inventory display details
      console.log(`[Hoopla RPG] DEBUG: Inventory display for ${player.name}:`);
      console.log(`[Hoopla RPG] DEBUG: Item counts:`, itemCounts);
      
      // Calculate XP progress to next level (handle max level case)
      const xpForCurrentLevel = (safeRpgData.level - this.config.startingLevel) * 100;
      const xpForNextLevel = this.getXPForNextLevel(safeRpgData.level);
      const xpInCurrentLevel = safeRpgData.experience - xpForCurrentLevel;
      const xpNeededForNextLevel = xpForNextLevel - xpForCurrentLevel;
      
      // Handle max level case to avoid division by zero
      const xpProgress = safeRpgData.level >= 30 ? 100 : 
        Math.min(100, Math.max(0, (xpInCurrentLevel / (xpForNextLevel - xpForCurrentLevel)) * 100));
      
      // Display main stats with MAX condition for player level
      const playerLevelDisplay = safeRpgData.level >= 30 ? 
        `<color="ff0">Level ${safeRpgData.level} (MAX)</>` : 
        `<color="ff0">Level ${safeRpgData.level}</> | <color="0ff">${xpInCurrentLevel}/${xpNeededForNextLevel} XP (${Math.round(xpProgress)}%)</>`;
      
      const mainStatsMessage = 
        `${playerLevelDisplay} | <color="f00">${safeRpgData.health}/${safeRpgData.maxHealth} HP</> | <color="0f0">${formattedCurrency}</>`;
      
      // Get skill progress
      const miningProgress = await this.getSkillProgress({ id: player.id }, 'mining');
      const barteringProgress = await this.getSkillProgress({ id: player.id }, 'bartering');
      const fishingProgress = await this.getSkillProgress({ id: player.id }, 'fishing');
      
      // Calculate XP progress to next level (handle max level case)
      const miningXPInLevel = this.getXPInCurrentSkillLevel(miningProgress.level, miningProgress.experience);
      const barteringXPInLevel = this.getXPInCurrentSkillLevel(barteringProgress.level, barteringProgress.experience);
      const fishingXPInLevel = this.getXPInCurrentSkillLevel(fishingProgress.level, fishingProgress.experience);
      
      // Create skill displays with MAX condition
      const miningDisplay = miningProgress.level >= 30 ? 
        `<color="0ff">Mining ${miningProgress.level} (MAX)</>` : 
        `<color="0ff">Mining ${miningProgress.level} - ${miningXPInLevel}/${miningProgress.xpForNextLevel}XP (${Math.round(miningProgress.progress)}%)</>`;
      
      const barteringDisplay = barteringProgress.level >= 30 ? 
        `<color="f0f">Bartering ${barteringProgress.level} (MAX)</>` : 
        `<color="f0f">Bartering ${barteringProgress.level} - ${barteringXPInLevel}/${barteringProgress.xpForNextLevel}XP (${Math.round(barteringProgress.progress)}%)</>`;
      
      const fishingDisplay = fishingProgress.level >= 30 ? 
        `<color="0aa">Fishing ${fishingProgress.level} (MAX)</>` : 
        `<color="0aa">Fishing ${fishingProgress.level} - ${fishingXPInLevel}/${fishingProgress.xpForNextLevel}XP (${Math.round(fishingProgress.progress)}%)</>`;
      
      const skillsMessage1 = `${miningDisplay} | ${barteringDisplay}`;
      const skillsMessage2 = `${fishingDisplay}`;
      
      // Inventory display removed - use /rpginventory command instead
      
      // Format consumables display
      let consumablesDisplay = "None";
      if (safeRpgData.consumables && safeRpgData.consumables.length > 0) {
        consumablesDisplay = safeRpgData.consumables
          .map(consumable => {
            const itemColor = this.resourceService.getResourceColor(consumable.name);
            return `<color="ff0">x${consumable.charges}</color> <color="${itemColor}">[${consumable.name}]</color>`;
          })
          .join(", ");
      }
      
      const consumablesMessage = `<color="fff">Consumables: ${consumablesDisplay}</>`;
      const helpMessage = `<color="888">Try /rpghelp for more commands, /rpginventory for items</color>`;
      
      // Send each line individually using whisper (original format)
      this.omegga.whisper(speaker, mainStatsMessage);
      this.omegga.whisper(speaker, skillsMessage1);
      this.omegga.whisper(speaker, skillsMessage2);
      this.omegga.whisper(speaker, consumablesMessage);
      this.omegga.whisper(speaker, helpMessage);

      // DEBUG: Output the exact message to console for comparison
      const statsMessage = `${mainStatsMessage}\n${skillsMessage1}\n${skillsMessage2}\n${consumablesMessage}\n${helpMessage}`;
      console.log(`[Hoopla RPG] DEBUG: /rpg command message for ${player.name}:`);
      console.log(`[Hoopla RPG] DEBUG: Raw message (with color tags):`);
      console.log(statsMessage);
      console.log(`[Hoopla RPG] DEBUG: Message without color tags:`);
      console.log(statsMessage.replace(/<color="[^"]*">/g, '').replace(/<\/color>/g, ''));
      console.log(`[Hoopla RPG] DEBUG: Message length: ${statsMessage.length} characters`);
    } catch (error) {
      console.error(`[Hoopla RPG] Error showing player stats:`, error);
      this.omegga.whisper(speaker, "An error occurred retrieving your stats.");
    }
  }

  /**
   * Show player inventory
   */
  private async showPlayerInventory(speaker: string): Promise<void> {
    try {
      const player = this.omegga.getPlayer(speaker);
      if (!player) return;

      const rpgData = await this.playerService.getPlayerData({ id: player.id });
      const safeRpgData = {
        inventory: rpgData.inventory ?? [],
        consumables: rpgData.consumables ?? []
      };
      
      // Count items by type
      const itemCounts: { [key: string]: number } = {};
      for (const item of safeRpgData.inventory) {
        itemCounts[item] = (itemCounts[item] || 0) + 1;
      }
      
      // Categorize items with comprehensive categorization
      const categories = this.categorizeItemsComprehensive(itemCounts);
      
      // Create compact inventory message with multiple items per line
      const maxLineLength = 200; // Conservative limit to avoid console errors
      let inventoryMessage = `<color="ff0">=== ${player.name}'s Inventory ===</color>\n`;
      
      // Display each category with compact formatting
      for (const [categoryName, categoryItems] of Object.entries(categories)) {
        if (Object.keys(categoryItems).length === 0) continue;
        
        const categoryItemsArray = Object.entries(categoryItems);
        const totalItems = categoryItemsArray.reduce((sum, [, count]) => sum + count, 0);
        
        // Sort items by rarity within each category
        const sortedItems = categoryItemsArray.sort(([itemA], [itemB]) => {
          const rarityA = this.getRarityOrder(itemA);
          const rarityB = this.getRarityOrder(itemB);
          return rarityA - rarityB; // Sort by rarity order (common first, legendary last)
        });
        
        // Build compact category display with line length limits
        let categoryDisplay = `<color="0f0">${categoryName.toUpperCase()} (${totalItems}):</color> `;
        let currentLineLength = categoryDisplay.length;
        let lineItems: string[] = [];
        let lines: string[] = [];
        
        for (const [item, count] of sortedItems) {
          const itemColor = this.resourceService.getResourceColor(item);
          const shortName = this.getShortItemName(item);
          const itemDisplay = `<color="${itemColor}">[${shortName}]</color><color="ff0">x${count}</color>`;
          const separator = lineItems.length > 0 ? "," : "";
          const testLength = currentLineLength + separator.length + itemDisplay.length;
          
          if (testLength > maxLineLength && lineItems.length > 0) {
            // Start new line
            lines.push(categoryDisplay + lineItems.join(","));
            categoryDisplay = `<color="0f0">  </color>`; // Indent continuation lines
            currentLineLength = categoryDisplay.length;
            lineItems = [itemDisplay];
          } else {
            lineItems.push(itemDisplay);
            currentLineLength = testLength;
          }
        }
        
        // Add the last line if there are items
        if (lineItems.length > 0) {
          lines.push(categoryDisplay + lineItems.join(","));
        }
        
        inventoryMessage += lines.join("\n") + "\n";
      }
      
      // Display consumables if any
      if (safeRpgData.consumables && safeRpgData.consumables.length > 0) {
        inventoryMessage += `<color="0f0">CONSUMABLES:</color> `;
        const consumableDisplays = safeRpgData.consumables.map(consumable => {
          const itemColor = this.resourceService.getResourceColor(consumable.name);
          return `<color="${itemColor}">[${consumable.name}]</color><color="ff0">x${consumable.charges}</color>`;
        });
        inventoryMessage += consumableDisplays.join(",") + "\n";
      }
      
      // Add summary
      const totalItems = safeRpgData.inventory.length;
      const uniqueItems = Object.keys(itemCounts).length;
      inventoryMessage += `<color="888">Total: ${totalItems} items (${uniqueItems} unique types)</color>`;
      
      // Send the message
      this.messagingService.sendLongMessage(speaker, inventoryMessage);
      
      // DEBUG: Output the exact message to console for comparison
      console.log(`[Hoopla RPG] DEBUG: /rpginventory command message for ${player.name}:`);
      console.log(`[Hoopla RPG] DEBUG: Raw message (with color tags):`);
      console.log(inventoryMessage);
      console.log(`[Hoopla RPG] DEBUG: Message without color tags:`);
      console.log(inventoryMessage.replace(/<color="[^"]*">/g, '').replace(/<\/color>/g, ''));
      console.log(`[Hoopla RPG] DEBUG: Message length: ${inventoryMessage.length} characters`);
      
      // Also log item counts for debugging
      console.log(`[Hoopla RPG] ${player.name} inventory item counts:`);
      for (const [item, count] of Object.entries(itemCounts)) {
        console.log(`  ${item}: ${count}`);
      }

    } catch (error) {
      console.error(`[Hoopla RPG] Error showing inventory:`, error);
      this.omegga.whisper(speaker, "An error occurred retrieving your inventory.");
    }
  }

  /**
   * Show leaderboard
   */
  private async showLeaderboard(speaker: string): Promise<void> {
    try {
      const leaderboard = await this.getLeaderboard();
      
      if (leaderboard.length === 0) {
        this.omegga.whisper(speaker, `<color="ff0">No players found on the leaderboard yet!</color>`);
        return;
      }

      // Format leaderboard for whisper (multi-line for better readability)
      this.omegga.whisper(speaker, `<color="ff0">Top Players Leaderboard:</color>`);
      
      for (let i = 0; i < leaderboard.length; i++) {
        const entry = leaderboard[i];
        const position = i + 1;
        const positionText = position === 1 ? "1st" : position === 2 ? "2nd" : position === 3 ? "3rd" : `${position}th`;
        
        // Get class information for this player
        const classDisplay = await this.classesService.getPlayerClassDisplay(entry.playerId);
        const classInfo = classDisplay !== 'No Class' ? ` (${classDisplay})` : '';
        
        const message = `${positionText}. <color="0ff">${entry.name}</color>${classInfo} - <color="ff0">${entry.score.toLocaleString()}</color> points`;
        this.omegga.whisper(speaker, message);
      }
      
    } catch (error) {
      console.error(`[Hoopla RPG] Error showing leaderboard:`, error);
      this.omegga.whisper(speaker, `<color="f00">Error loading leaderboard: ${error.message}</color>`);
    }
  }

  /**
   * Announce leaderboard to all players (compact format for server announcements)
   */
  private async announceLeaderboard(): Promise<void> {
    try {
      const leaderboard = await this.getLeaderboard();
      
      if (leaderboard.length === 0) {
        return; // Don't announce if no players
      }

      // Create compact format for server announcement (single line)
      const topPlayers = [];
      for (let i = 0; i < Math.min(10, leaderboard.length); i++) {
        const entry = leaderboard[i];
        const position = i + 1;
        const positionText = position === 1 ? "1st" : position === 2 ? "2nd" : position === 3 ? "3rd" : `${position}th`;
        
        // Get class information for this player
        const classDisplay = await this.classesService.getPlayerClassDisplay(entry.playerId);
        const classInfo = classDisplay !== 'No Class' ? `(${classDisplay})` : `(L${entry.level})`;
        
        topPlayers.push(`${positionText}. <color="0ff">${entry.name}</color>${classInfo}`);
      }

      // Broadcast compact leaderboard
      this.omegga.broadcast(`<color="ff0">🏆 Top Players:</color> ${topPlayers}`);
      
    } catch (error) {
      console.error(`[Hoopla RPG] Error announcing leaderboard:`, error);
    }
  }

  // ============================================================================
  // PLAYER DATA OPERATIONS - Delegated to PlayerService
  // ============================================================================


  // ============================================================================
  // INVENTORY OPERATIONS - Delegated to InventoryService
  // ============================================================================


  /**
   * Add consumable item
   */
  async addConsumable({ id }: PlayerId, name: string, maxCharges: number): Promise<void> {
    const player = await this.playerService.getPlayerData({ id });
    if (!player.consumables) {
      player.consumables = [];
    }
    
    // Check if player already has this consumable
    const existingConsumable = player.consumables.find(c => c.name === name);
    if (existingConsumable) {
      existingConsumable.charges += maxCharges;
      } else {
      player.consumables.push({
        name,
        charges: maxCharges,
        maxCharges
      });
    }
    
    await this.playerService.setPlayerData({ id }, player);
  }

  // ============================================================================
  // RESOURCE OPERATIONS - Delegated to ResourceService
  // ============================================================================


  // ============================================================================
  // UTILITY OPERATIONS - Delegated to Utility Services
  // ============================================================================


  // ============================================================================
  // HELPER METHODS FOR UI DISPLAY
  // ============================================================================

  /**
   * Calculate XP progress for current level
   */
  private calculateXPProgress(currentLevel: number, currentXP: number): { current: number; needed: number; progress: number } {
    if (currentLevel >= 30) {
      return { current: 0, needed: 0, progress: 100 };
    }

    // Calculate XP requirements (doubled system from original)
    const xpForCurrentLevel = this.getXPForLevel(currentLevel);
    const xpForNextLevel = this.getXPForLevel(currentLevel + 1);
    
    // Calculate XP in current level and progress
    const xpInCurrentLevel = currentXP - xpForCurrentLevel;
    const xpNeededForNextLevel = xpForNextLevel - currentXP;
    const progress = Math.min(100, Math.max(0, (xpInCurrentLevel / (xpForNextLevel - xpForCurrentLevel)) * 100));
    
    return {
      current: xpInCurrentLevel,
      needed: xpForNextLevel - xpForCurrentLevel,
      progress: progress
    };
  }

  /**
   * Get XP required for a specific level (doubled system)
   */
  private getXPForLevel(level: number): number {
    if (level <= 1) return 0;
    if (level <= 5) return (level - 1) * 100 * 2; // 200, 400, 600, 800
    if (level <= 10) return 800 + (level - 5) * 200 * 2; // 1000, 1400, 1800, 2200, 2600
    if (level <= 15) return 2600 + (level - 10) * 300 * 2; // 3200, 3800, 4400, 5000, 5600
    if (level <= 20) return 5600 + (level - 15) * 400 * 2; // 6400, 7200, 8000, 8800, 9600
    if (level <= 25) return 9600 + (level - 20) * 500 * 2; // 10600, 11600, 12600, 13600, 14600
    if (level <= 30) return 14600 + (level - 25) * 600 * 2; // 15200, 15800, 16400, 17000, 17600
    return 17600; // Max level
  }

  /**
   * Format inventory display with categories, colors, and rarity sorting
   */
  private formatInventoryDisplay(itemCounts: { [key: string]: number }): string {
    if (Object.keys(itemCounts).length === 0) {
      return "<color=\"888\">(empty)</color>";
    }

    // Categorize items
    const categories = this.categorizeItems(itemCounts);
    const displayParts: string[] = [];

    // Process each category
    for (const [categoryName, categoryItems] of Object.entries(categories)) {
      if (Object.keys(categoryItems).length === 0) continue;
      
      // Sort items by rarity within each category
      const categoryItemsArray = Object.entries(categoryItems).sort(([itemA], [itemB]) => {
        const rarityA = this.getRarityOrder(itemA);
        const rarityB = this.getRarityOrder(itemB);
        return rarityA - rarityB; // Sort by rarity order (common first, legendary last)
      });
      
      const shouldTruncate = categoryItemsArray.length > 8;
      const itemsToShow = shouldTruncate ? categoryItemsArray.slice(0, 7) : categoryItemsArray;
      
      let categoryDisplay = itemsToShow.map(([item, count]) => {
        const itemColor = this.resourceService.getResourceColor(item);
        const shortName = this.getShortItemName(item);
        return `<color="${itemColor}">[${shortName}]</color><color="ff0">x${count}</color>`;
      }).join(',');
      
      if (shouldTruncate) {
        const remainingCount = categoryItemsArray.length - 7;
        const totalRemaining = categoryItemsArray.slice(7).reduce((sum, [, count]) => sum + count, 0);
        categoryDisplay += `,<color="f80">+${remainingCount} more (${totalRemaining} items)</color>`;
      }
      
      displayParts.push(categoryDisplay);
    }
    
    return displayParts.join(',');
  }

  /**
   * Categorize items for display
   */
  private categorizeItems(itemCounts: { [key: string]: number }): { [category: string]: { [item: string]: number } } {
    const categories: { [category: string]: { [item: string]: number } } = {
      fish: {},
      ore: {},
      consumables: {},
      quest: {},
      other: {}
    };

    for (const [item, count] of Object.entries(itemCounts)) {
      const lowerItem = item.toLowerCase();
      
      if (lowerItem.includes('fish') || lowerItem.includes('gup') || lowerItem.includes('cod') || 
          lowerItem.includes('shark') || lowerItem.includes('whale') || lowerItem.includes('kraken') ||
          lowerItem.includes('sardine') || lowerItem.includes('tuna') || lowerItem.includes('marlin') ||
          lowerItem.includes('megalodon') || lowerItem.includes('leviathan') || lowerItem.includes('clownfish') ||
          lowerItem.includes('angelfish') || lowerItem.includes('lionfish') || lowerItem.includes('manta ray') ||
          lowerItem.includes('sea dragon') || lowerItem.includes('icefish') || lowerItem.includes('arctic char') ||
          lowerItem.includes('beluga') || lowerItem.includes('narwhal') || lowerItem.includes('frost kraken')) {
        categories.fish[item] = count;
      } else if (lowerItem.includes('ore') || lowerItem.includes('copper') || lowerItem.includes('iron') || 
                 lowerItem.includes('gold') || lowerItem.includes('obsidian') || lowerItem.includes('diamond')) {
        categories.ore[item] = count;
      } else if (lowerItem.includes('bait') || lowerItem.includes('consumable')) {
        categories.consumables[item] = count;
      } else if (lowerItem.includes('box') || lowerItem.includes('quest')) {
        categories.quest[item] = count;
    } else {
        categories.other[item] = count;
      }
    }

    return categories;
  }

  /**
   * Comprehensive item categorization for inventory display
   */
  private categorizeItemsComprehensive(itemCounts: { [key: string]: number }): { [category: string]: { [item: string]: number } } {
    const categories: { [category: string]: { [item: string]: number } } = {
      fish: {},
      ore: {},
      quest: {},
      consumables: {},
      other: {}
    };

    // Define comprehensive item lists for each category
    const fishItems = [
      'Gup', 'Cod', 'Shark', 'Whale', 'Kraken', 'Sardine', 'Tuna', 'Marlin', 
      'Megalodon', 'Leviathan', 'Clownfish', 'Angelfish', 'Lionfish', 'Manta Ray', 
      'Sea Dragon', 'Icefish', 'Arctic Char', 'Beluga', 'Narwhal', 'Frost Kraken'
    ];

    const oreItems = [
      'Copper Ore', 'Iron Ore', 'Gold Ore', 'Obsidian Ore', 'Diamond Ore'
    ];

    const questItems = [
      'Ice Box', 'Ice Chest', 'Brickingway Box', 'Ice Crystal', 'Ice Crown', 'Frozen Heart'
    ];

    const consumableItems = [
      'Fish bait'
    ];

    for (const [item, count] of Object.entries(itemCounts)) {
      // Check for exact matches first (case-insensitive)
      const lowerItem = item.toLowerCase();
      
      if (fishItems.some(fish => fish.toLowerCase() === lowerItem)) {
        categories.fish[item] = count;
      } else if (oreItems.some(ore => ore.toLowerCase() === lowerItem)) {
        categories.ore[item] = count;
      } else if (questItems.some(quest => quest.toLowerCase() === lowerItem)) {
        categories.quest[item] = count;
      } else if (consumableItems.some(consumable => consumable.toLowerCase() === lowerItem)) {
        categories.consumables[item] = count;
      } else {
        // Fallback to partial matching for variations
        if (lowerItem.includes('fish') || lowerItem.includes('gup') || lowerItem.includes('cod') || 
            lowerItem.includes('shark') || lowerItem.includes('whale') || lowerItem.includes('kraken') ||
            lowerItem.includes('sardine') || lowerItem.includes('tuna') || lowerItem.includes('marlin') ||
            lowerItem.includes('megalodon') || lowerItem.includes('leviathan') || lowerItem.includes('clownfish') ||
            lowerItem.includes('angelfish') || lowerItem.includes('lionfish') || lowerItem.includes('manta ray') ||
            lowerItem.includes('sea dragon') || lowerItem.includes('icefish') || lowerItem.includes('arctic char') ||
            lowerItem.includes('beluga') || lowerItem.includes('narwhal') || lowerItem.includes('frost kraken')) {
          categories.fish[item] = count;
        } else if (lowerItem.includes('ore') || lowerItem.includes('copper') || lowerItem.includes('iron') || 
                   lowerItem.includes('gold') || lowerItem.includes('obsidian') || lowerItem.includes('diamond')) {
          categories.ore[item] = count;
        } else if (lowerItem.includes('bait') || lowerItem.includes('consumable')) {
          categories.consumables[item] = count;
        } else if (lowerItem.includes('box') || lowerItem.includes('crystal') || lowerItem.includes('crown') || 
                   lowerItem.includes('heart') || lowerItem.includes('quest')) {
          categories.quest[item] = count;
        } else {
          categories.other[item] = count;
        }
      }
    }

    return categories;
  }

  /**
   * Normalize item name to standard format (proper capitalization)
   */
  private normalizeItemName(item: string): string {
    const itemMap: { [key: string]: string } = {
      // Fish
      'gup': 'Gup',
      'cod': 'Cod',
      'shark': 'Shark',
      'whale': 'Whale',
      'kraken': 'Kraken',
      'sardine': 'Sardine',
      'tuna': 'Tuna',
      'marlin': 'Marlin',
      'megalodon': 'Megalodon',
      'leviathan': 'Leviathan',
      'clownfish': 'Clownfish',
      'angelfish': 'Angelfish',
      'lionfish': 'Lionfish',
      'manta ray': 'Manta Ray',
      'sea dragon': 'Sea Dragon',
      'icefish': 'Icefish',
      'arctic char': 'Arctic Char',
      'beluga': 'Beluga',
      'narwhal': 'Narwhal',
      'frost kraken': 'Frost Kraken',
      
      // Ores
      'copper': 'Copper Ore',
      'copper ore': 'Copper Ore',
      'iron': 'Iron Ore',
      'iron ore': 'Iron Ore',
      'gold': 'Gold Ore',
      'gold ore': 'Gold Ore',
      'obsidian': 'Obsidian Ore',
      'obsidian ore': 'Obsidian Ore',
      'diamond': 'Diamond Ore',
      'diamond ore': 'Diamond Ore',
      
      // Quest Items
      'ice box': 'Ice Box',
      'ice chest': 'Ice Chest',
      'brickingway box': 'Brickingway Box',
      'ice crystal': 'Ice Crystal',
      'ice crown': 'Ice Crown',
      'frozen heart': 'Frozen Heart',
      
      // Consumables
      'fish bait': 'Fish bait',
      'bait': 'Fish bait'
    };

    const lowerItem = item.toLowerCase().trim();
    return itemMap[lowerItem] || this.capitalizeWords(item);
  }

  /**
   * Capitalize words in a string (first letter of each word)
   */
  private capitalizeWords(str: string): string {
    return str.toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
  }

  /**
   * Get short item name for display
   */
  private getShortItemName(item: string): string {
    const shortNames: { [key: string]: string } = {
      // Ores
      'Gold Ore': 'Gold',
      'Iron Ore': 'Iron', 
      'Copper Ore': 'Copper',
      'Diamond Ore': 'Diamond',
      'Obsidian Ore': 'Obsidian',
      
      // Freshwater fish
      'Gup': 'Gup',
      'Cod': 'Cod',
      'Shark': 'Shark',
      'Whale': 'Whale',
      'Kraken': 'Kraken',
      
      // Deep ocean fish
      'Sardine': 'Sardine',
      'Tuna': 'Tuna',
      'Marlin': 'Marlin',
      'Megalodon': 'Megalodon',
      'Leviathan': 'Leviathan',
      
      // Tropical fish
      'Clownfish': 'Clownfish',
      'Angelfish': 'Angelfish',
      'Lionfish': 'Lionfish',
      'Manta Ray': 'Manta Ray',
      'Sea Dragon': 'Sea Dragon',
      
      // Arctic fish
      'Icefish': 'Icefish',
      'Arctic Char': 'Arctic Char',
      'Beluga': 'Beluga',
      'Narwhal': 'Narwhal',
      'Frost Kraken': 'Frost Kraken',
      
      // Consumables
      'Fish bait': 'Bait',
      
      // Quest items
      'brickingway box': 'Box',
      'ice box': 'Ice Box',
      'ice chest': 'Ice Chest',
      'Brickingway Box': 'Box',
      'Ice Box': 'Ice Box',
      'Ice Chest': 'Ice Chest'
    };
    
    return shortNames[item] || item;
  }

  /**
   * Safely get currency with fallback
   */
  private async getCurrencySafely(playerId: string): Promise<number> {
    try {
      if (!this.currency.plugin) {
        throw new Error("Currency plugin not loaded");
      }
      return await this.currency.getCurrency(playerId);
    } catch (error) {
      console.log(`[Hoopla RPG] Currency plugin not available, using fallback: ${error.message}`);
      return 0;
    }
  }

  /**
   * Safely format currency with fallback
   */
  private async formatCurrencySafely(amount: number): Promise<string> {
    try {
      if (!this.currency.plugin) {
        throw new Error("Currency plugin not loaded");
      }
      return await this.currency.format(amount);
    } catch (error) {
      console.log(`[Hoopla RPG] Currency plugin not available, using fallback: ${error.message}`);
      if (amount === 0) {
        return "Currency plugin not loaded";
      }
      return `$${amount.toLocaleString()}`;
    }
  }

  /**
   * Safely add currency with fallback
   */
  private async addCurrencySafely(playerId: string, amount: number): Promise<void> {
    try {
      if (!this.currency.plugin) {
        throw new Error("Currency plugin not loaded");
      }
      await this.currency.add(playerId, "currency", amount);
    } catch (error) {
      console.log(`[Hoopla RPG] Currency plugin not available, cannot add currency: ${error.message}`);
    }
  }

  /**
   * Get rarity order for sorting (lower number = higher priority/common)
   */
  private getRarityOrder(item: string): number {
    const rarityOrder: { [key: string]: number } = {
      // Common (White) - Priority 1-10
      'Gup': 1,
      'Copper Ore': 2,
      'Sardine': 3,
      'Clownfish': 4,
      'Icefish': 5,
      
      // Uncommon (Green) - Priority 11-20
      'Iron Ore': 11,
      'Cod': 12,
      'Tuna': 13,
      'Angelfish': 14,
      'Arctic Char': 15,
      
      // Rare (Blue) - Priority 21-30
      'Gold Ore': 21,
      'Shark': 22,
      'Marlin': 23,
      'Lionfish': 24,
      'Beluga': 25,
      'Ice Box': 26,
      
      // Epic (Purple) - Priority 31-40
      'Whale': 31,
      'Obsidian Ore': 32,
      'Megalodon': 33,
      'Manta Ray': 34,
      'Narwhal': 35,
      
      // Legendary (Orange) - Priority 41-50
      'Kraken': 41,
      'Diamond Ore': 42,
      'Leviathan': 43,
      'Sea Dragon': 44,
      'Frost Kraken': 45,
      'Brickingway Box': 46,
      'Ice Chest': 47,
      
      // Consumables - Priority 51-60
      'Fish bait': 51,
      
      // Quest items - Priority 61-70
      'brickingway box': 61,
      'ice box': 62,
      'ice chest': 63
    };
    
    return rarityOrder[item] || 999; // Unknown items go to end
  }

  /**
   * Get leaderboard data
   */
  private async getLeaderboard(): Promise<Array<{ playerId: string; name: string; level: number; score: number }>> {
    const leaderboard: Array<{ playerId: string; name: string; level: number; score: number }> = [];
    
    // Get all player IDs that have ever played
    const allPlayerIds = await this.store.get("all_player_ids") as unknown as string[] || [];
    
    for (const playerId of allPlayerIds) {
      try {
        const playerData = await this.playerService.getPlayerData({ id: playerId });
        const score = await this.getPlayerScore(playerId);
        
        // Only include players who have some XP (not just default players)
        if (score > 0) {
            // Get stored player name from database, fallback to online player name, then truncated ID
            const storedPlayerName = playerData.username;
            const onlinePlayer = this.omegga.getPlayer(playerId);
            const playerName = storedPlayerName || onlinePlayer?.name || `Player_${playerId.substring(0, 8)}`;
          
          leaderboard.push({
            playerId,
            name: playerName,
            level: playerData.level || 1,
            score
          });
        }
      } catch (error) {
        console.log(`[Hoopla RPG] Error getting score for player ${playerId}:`, error);
      }
    }
    
    // Sort by score (highest first) and return top 10
    return leaderboard.sort((a, b) => b.score - a.score).slice(0, 10);
  }

  /**
   * Get player score (total XP including skills)
   */
  private async getPlayerScore(playerId: string): Promise<number> {
    const player = await this.playerService.getPlayerData({ id: playerId });
    let totalScore = player.experience || 0;
    
    // Add skill XP to total score
    if (player.skills) {
      totalScore += (player.skills.mining?.experience || 0);
      totalScore += (player.skills.fishing?.experience || 0);
      totalScore += (player.skills.bartering?.experience || 0);
    }
    
    return totalScore;
  }

  /**
   * Show mining info
   */
  private async showMiningInfo(speaker: string): Promise<void> {
    try {
      this.omegga.whisper(speaker, `<color="0ff">=== Mining Level Requirements ===</color>`);
      this.omegga.whisper(speaker, `<color="fff">Copper: Any level</color>`);
      this.omegga.whisper(speaker, `<color="0f0">Iron: Level 5+</color>`);
      this.omegga.whisper(speaker, `<color="00f">Gold: Level 10+</color>`);
      this.omegga.whisper(speaker, `<color="f0f">Obsidian: Level 15+</color>`);
      this.omegga.whisper(speaker, `<color="f80">Diamond: Level 20+</color>`);
    } catch (error) {
      console.error(`[Hoopla RPG] Error showing mining info:`, error);
      this.omegga.whisper(speaker, "An error occurred retrieving mining information.");
    }
  }

  /**
   * Show fishing info
   */
  private async showFishingInfo(speaker: string): Promise<void> {
    try {
      this.omegga.whisper(speaker, `<color="0ff">=== Fish Rarity & Level Requirements ===</color>`);
      
      // Freshwater fish (rpg_fishing_spot)
      this.omegga.whisper(speaker, `<color="0ff">--- Freshwater Fishing (rpg_fishing_spot) ---</color>`);
      this.omegga.whisper(speaker, `<color="fff">Gup: Common (any level)</color>`);
      this.omegga.whisper(speaker, `<color="0f0">Cod: Uncommon (level 3+)</color>`);
      this.omegga.whisper(speaker, `<color="00f">Shark: Rare (level 8+)</color>`);
      this.omegga.whisper(speaker, `<color="f0f">Whale: Epic (level 15+)</color>`);
      this.omegga.whisper(speaker, `<color="f80">Kraken: Legendary (level 25+)</color>`);
      
      // Deep ocean fish (rpg_fishing_spot_2)
      this.omegga.whisper(speaker, `<color="0ff">--- Deep Ocean Fishing (rpg_fishing_spot_2) ---</color>`);
      this.omegga.whisper(speaker, `<color="fff">Sardine: Common (any level)</color>`);
      this.omegga.whisper(speaker, `<color="0f0">Tuna: Uncommon (level 3+)</color>`);
      this.omegga.whisper(speaker, `<color="00f">Marlin: Rare (level 8+)</color>`);
      this.omegga.whisper(speaker, `<color="f0f">Megalodon: Epic (level 15+)</color>`);
      this.omegga.whisper(speaker, `<color="f80">Leviathan: Legendary (level 25+)</color>`);
      
      // Tropical reef fish (rpg_fishing_spot_3)
      this.omegga.whisper(speaker, `<color="0ff">--- Tropical Reef Fishing (rpg_fishing_spot_3) ---</color>`);
      this.omegga.whisper(speaker, `<color="fff">Clownfish: Common (any level)</color>`);
      this.omegga.whisper(speaker, `<color="0f0">Angelfish: Uncommon (level 3+)</color>`);
      this.omegga.whisper(speaker, `<color="00f">Lionfish: Rare (level 8+)</color>`);
      this.omegga.whisper(speaker, `<color="f0f">Manta Ray: Epic (level 15+)</color>`);
      this.omegga.whisper(speaker, `<color="f80">Sea Dragon: Legendary (level 25+)</color>`);
      
      // Arctic fish (rpg_fishing_spot_4)
      this.omegga.whisper(speaker, `<color="0ff">--- Arctic Fishing (rpg_fishing_spot_4) ---</color>`);
      this.omegga.whisper(speaker, `<color="fff">Icefish: Common (any level)</color>`);
      this.omegga.whisper(speaker, `<color="0f0">Arctic Char: Uncommon (level 3+)</color>`);
      this.omegga.whisper(speaker, `<color="00f">Beluga: Rare (level 8+)</color>`);
      this.omegga.whisper(speaker, `<color="f0f">Narwhal: Epic (level 15+)</color>`);
      this.omegga.whisper(speaker, `<color="f80">Frost Kraken: Legendary (level 25+)</color>`);
    } catch (error) {
      console.error(`[Hoopla RPG] Error showing fishing info:`, error);
      this.omegga.whisper(speaker, "An error occurred retrieving fishing information.");
    }
  }

  /**
   * Get quest item progress message showing current progress
   */
  private async getQuestItemProgressMessage(playerId: string, itemName: string): Promise<string> {
    try {
      const player = await this.playerService.getPlayerData({ id: playerId });
      
      // Count how many of this item the player has
      const itemCount = player.inventory?.filter(item => item.toLowerCase() === itemName.toLowerCase()).length || 0;
      const itemColor = this.resourceService.getResourceColor(itemName);
      
      // Check if this item is part of any active quest requirements
      const activeQuests = Object.values(player.quests || {}).filter((quest: any) => quest.status === 'in_progress');
      
      for (const quest of activeQuests) {
        for (const requirement of quest.requirements || []) {
          if (requirement.type === 'item' && requirement.target.toLowerCase() === itemName.toLowerCase()) {
            const remaining = Math.max(0, requirement.amount - itemCount);
            if (remaining > 0) {
              return `You collected <color="${itemColor}">[${itemName}]</color>! Progress: <color="0f0">${itemCount}</color>/<color="ff0">${requirement.amount}</color> (<color="f00">${remaining}</color> remaining)`;
            } else {
              return `You collected <color="${itemColor}">[${itemName}]</color>! Quest complete: <color="0f0">${itemCount}</color>/<color="ff0">${requirement.amount}</color>`;
            }
          }
        }
      }
      
      // If not part of any quest, just show basic collection message
      return `You collected <color="${itemColor}">[${itemName}]</color>!`;
      
    } catch (error) {
      console.error(`[Hoopla RPG] Error getting quest item progress message:`, error);
      const itemColor = this.resourceService.getResourceColor(itemName);
      return `You collected <color="${itemColor}">[${itemName}]</color>!`;
    }
  }


  // ============================================================================
  // ADDITIONAL COMMAND HANDLERS
  // ============================================================================

  /**
   * Handle RPG initialization
   */
  private async handleRPGInit(speaker: string): Promise<void> {
    try {
      this.omegga.whisper(speaker, `<color="f0f">Initializing RPG systems...</color>`);

        // Initialize the interaction-based RPG system
        await this.initializeRPGOnInteraction();

        this.omegga.whisper(speaker, `<color="0f0">RPG systems initialized successfully!</color>`);
        this.omegga.whisper(speaker, `<color="888">Click on RPG bricks to discover and activate them.</color>`);
        } catch (error) {
        console.error(`[Hoopla RPG] Error during RPG initialization:`, error);
        this.omegga.whisper(speaker, `<color="f00">Error initializing RPG systems: ${error.message}</color>`);
       }
  }

  /**
   * Handle class selection command
   */
  private async handleClassSelection(speaker: string, args: string[]): Promise<void> {
    try {
      if (args.length === 0) {
        // Show class selection help
        const helpMessage = this.classSelectionService.getClassSelectionHelp();
        this.omegga.whisper(speaker, helpMessage);
        return;
      }

      const classId = args[0].toLowerCase();
      const result = await this.classSelectionService.handleClassSelection(speaker, classId);
      
      if (result.success) {
        this.omegga.whisper(speaker, result.message);
      } else {
        this.omegga.whisper(speaker, result.message);
      }
    } catch (error) {
      console.error(`[Hoopla RPG] Error handling class selection:`, error);
      this.omegga.whisper(speaker, '<color="f00">Error selecting class. Please try again.</color>');
    }
  }

  /**
   * Handle RPG fix level command
   */
  private async handleRPGFixLevel(speaker: string): Promise<void> {
    try {
      const player = this.omegga.getPlayer(speaker);
      if (!player) return;

      this.omegga.whisper(speaker, `<color="0ff">Checking for overleveled status...</color>`);
      
        await this.fixOverleveledPlayer(player.id);
        this.omegga.whisper(speaker, `<color="0f0">Level check complete! Use /rpg to see your current status.</color>`);
      } catch (error) {
        console.error(`[Hoopla RPG] Error fixing overleveled player ${speaker}:`, error);
        this.omegga.whisper(speaker, `<color="f00">Error fixing level status: ${error.message}</color>`);
      }
  }

  /**
   * Handle RPG clear all command
   */
  private async handleRPGClearAll(speaker: string): Promise<void> {
    try {
              console.log(`[Hoopla RPG] RPG clear all command received from ${speaker}`);
      
        const triggers = await this.getBrickTriggers();
        const triggerCount = Object.keys(triggers).length;
        
        if (triggerCount === 0) {
          this.omegga.whisper(speaker, `<color="f0f">No RPG systems to clear!</color>`);
           return;
         }

        // Clear all triggers
        await this.setBrickTriggers({});
        
        console.log(`[Hoopla RPG] Cleared all ${triggerCount} RPG systems`);
        this.omegga.whisper(speaker, `<color="0f0">Cleared all ${triggerCount} RPG systems! You now have a clean slate.</color>`);
       } catch (error) {
         console.error(`[Hoopla RPG] Error clearing all RPG systems:`, error);
         this.omegga.whisper(speaker, `<color="f00">Failed to clear RPG systems: ${error.message}</>`);
       }
  }

  /**
   * Handle RPG clear triggers command
   */
  private async handleRPGClearTriggers(speaker: string): Promise<void> {
    try {
      const player = this.omegga.getPlayer(speaker);
      if (!player) return;

      this.omegga.whisper(speaker, `<color="f00">Clearing all RPG triggers...</color>`);

        // Clear all triggers
        await this.setBrickTriggers({});

        this.omegga.whisper(speaker, `<color="0f0">All RPG triggers cleared successfully!</color>`);
        this.omegga.whisper(speaker, `<color="888">Click on RPG bricks to recreate them with updated prices.</color>`);
       } catch (error) {
        console.error(`[Hoopla RPG] Error clearing RPG triggers:`, error);
        this.omegga.whisper(speaker, `<color="f00">Error clearing RPG triggers: ${error.message}</color>`);
      }
  }

  /**
   * Handle RPG clear quest triggers command
   */
  private async handleRPGClearQuests(speaker: string): Promise<void> {
    try {
      const player = this.omegga.getPlayer(speaker);
      if (!player) return;

      this.omegga.whisper(speaker, `<color="f00">Clearing quest triggers...</color>`);

        const triggers = await this.getBrickTriggers();
        let questTriggerCount = 0;
        
        // Find and remove quest triggers
        for (const [triggerId, trigger] of Object.entries(triggers)) {
        if ((trigger as any).type === 'quest') {
            delete triggers[triggerId];
            questTriggerCount++;
          }
        }
        
        await this.setBrickTriggers(triggers);

        this.omegga.whisper(speaker, `<color="0f0">Cleared ${questTriggerCount} quest triggers!</color>`);
        this.omegga.whisper(speaker, `<color="888">Click on quest bricks to recreate them.</color>`);
       } catch (error) {
         console.error(`[Hoopla RPG] Error clearing quest triggers:`, error);
         this.omegga.whisper(speaker, `<color="f00">Failed to clear quest triggers: ${error.message}</color>`);
       }
  }

  /**
   * Handle RPG reset quest progress command
   */
  private async handleRPGResetQuests(speaker: string): Promise<void> {
    try {
      const player = this.omegga.getPlayer(speaker);
      if (!player) return;

      this.omegga.whisper(speaker, `<color="f00">Resetting your quest progress...</color>`);

      const playerData = await this.playerService.getPlayerData({ id: player.id });
      const questCount = Object.keys(playerData.quests || {}).length;
      
      if (questCount > 0) {
          playerData.quests = {}; // Clear all quest progress and interaction steps
        await this.playerService.setPlayerData({ id: player.id }, playerData);
          
          this.omegga.whisper(speaker, `<color="0f0">Reset ${questCount} quests!</color>`);
          this.omegga.whisper(speaker, `<color="888">You can now start quests from the beginning.</color>`);
                 } else {
          this.omegga.whisper(speaker, `<color="888">No quest progress to reset.</color>`);
         }
       } catch (error) {
         console.error(`[Hoopla RPG] Error resetting quest progress:`, error);
      this.omegga.whisper(speaker, `<color="f00">Error resetting quest progress: ${error.message}</color>`);
    }
  }

  /**
   * Handle RPG reset quest items command
   */
  private async handleRPGResetQuestItems(speaker: string): Promise<void> {
    try {
      const player = this.omegga.getPlayer(speaker);
      if (!player) return;

      this.omegga.whisper(speaker, `<color="f00">Resetting quest item collection states...</color>`);

      const triggers = await this.getBrickTriggers();
      let resetCount = 0;
      
      // Find and reset quest item triggers
      for (const [triggerId, trigger] of Object.entries(triggers)) {
        if ((trigger as any).type === 'questitem') {
          // Clear the collectedBy array for this quest item
          (trigger as any).collectedBy = [];
          resetCount++;
        }
      }
      
      if (resetCount > 0) {
        await this.setBrickTriggers(triggers);
        this.omegga.whisper(speaker, `<color="0f0">Reset ${resetCount} quest item collection states!</color>`);
        this.omegga.whisper(speaker, `<color="888">You can now collect all quest items again.</color>`);
      } else {
        this.omegga.whisper(speaker, `<color="888">No quest item collection states to reset.</color>`);
      }
      
    } catch (error) {
      console.error(`[Hoopla RPG] Error resetting quest item collection states:`, error);
      this.omegga.whisper(speaker, `<color="f00">Error resetting quest item collection states: ${error.message}</color>`);
    }
  }

  /**
   * Handle RPG clear inventory command
   */
  private async handleRPGClearInventory(speaker: string): Promise<void> {
    try {
      const player = this.omegga.getPlayer(speaker);
      if (!player) return;

      this.omegga.whisper(speaker, `<color="f0f">Clearing your inventory...</color>`);

      const playerData = await this.playerService.getPlayerData({ id: player.id });
      const originalCount = playerData.inventory?.length || 0;
      
      if (originalCount > 0) {
        playerData.inventory = []; // Clear inventory
        await this.playerService.setPlayerData({ id: player.id }, playerData);
        
        this.omegga.whisper(speaker, `<color="0f0">Cleared ${originalCount} items from your inventory!</color>`);
        } else {
        this.omegga.whisper(speaker, `<color="888">Your inventory is already empty.</color>`);
        }
      } catch (error) {
      console.error(`[Hoopla RPG] Error clearing inventory:`, error);
        this.omegga.whisper(speaker, `<color="f00">Error clearing inventory: ${error.message}</color>`);
      }
  }

  /**
   * Handle RPG fix shopkeepers command
   */
  private async handleRPGFixShopkeepers(speaker: string): Promise<void> {
    try {
      console.log(`[DEBUG] Fixing shopkeeper triggers for player: ${speaker}`);
      
      const triggers = await this.getBrickTriggers();
      let fixedCount = 0;
      
      for (const [triggerId, trigger] of Object.entries(triggers)) {
        const message = trigger.message || '';
        const lowerMessage = message.toLowerCase();
        
        // Check if this is a shopkeeper trigger with wrong type
        if ((lowerMessage.includes('rpg_sell_all_fish') || lowerMessage.includes('rpg_sell_all_ores')) && trigger.type !== 'bulk_sell') {
          console.log(`[DEBUG] Fixing trigger ${triggerId}: ${trigger.type} -> bulk_sell`);
          trigger.type = 'bulk_sell';
          fixedCount++;
        } else if (lowerMessage.includes('rpg_buy_') && trigger.type !== 'buy') {
          console.log(`[DEBUG] Fixing trigger ${triggerId}: ${trigger.type} -> buy`);
          trigger.type = 'buy';
          fixedCount++;
        }
        
        // Fix prices for buy triggers
        if (lowerMessage.includes('rpg_buy_bait') && trigger.value !== 100) {
          console.log(`[DEBUG] Fixing bait price for trigger ${triggerId}: ${trigger.value} -> 100`);
          trigger.value = 100;
          fixedCount++;
        } else if (lowerMessage.includes('rpg_buy_saber') && trigger.value !== 5000) {
          console.log(`[DEBUG] Fixing saber price for trigger ${triggerId}: ${trigger.value} -> 5000`);
          trigger.value = 5000;
          fixedCount++;
        }
      }
      
      if (fixedCount > 0) {
        await this.setBrickTriggers(triggers);
        this.omegga.whisper(speaker, `<color="0f0">Fixed ${fixedCount} shopkeeper triggers (types and prices)!</color>`);
        console.log(`[DEBUG] Fixed ${fixedCount} shopkeeper triggers`);
      } else {
        this.omegga.whisper(speaker, `<color="888">No shopkeeper triggers needed fixing.</color>`);
      }
      
    } catch (error) {
      console.error(`[Hoopla RPG] Error fixing shopkeeper triggers:`, error);
      this.omegga.whisper(speaker, `<color="f00">Error fixing shopkeeper triggers: ${error.message}</color>`);
    }
  }

  /**
   * Handle RPG convert bait command
   */
  private async handleRPGConvertBait(speaker: string): Promise<void> {
    try {
      console.log(`[DEBUG] Converting old bait to new system for player: ${speaker}`);
      
      const omeggaPlayer = this.omegga.getPlayer(speaker);
      if (!omeggaPlayer) {
        this.omegga.whisper(speaker, "Player not found.");
        return;
      }
      
      const player = await this.playerService.getPlayerData({ id: omeggaPlayer.id });
      
      if (!player || !player.inventory) {
        this.omegga.whisper(speaker, "No inventory found.");
        return;
      }
      
      // Find old bait items in inventory
      const oldBaitItems = player.inventory.filter(item => 
        item.toLowerCase() === 'bait' || item.toLowerCase() === 'fish bait'
      );
      
      if (oldBaitItems.length === 0) {
        this.omegga.whisper(speaker, `<color="888">No old bait items found to convert.</color>`);
        return;
      }
      
      // Remove old bait items from inventory
      for (const baitItem of oldBaitItems) {
        await this.inventoryService.removeFromInventory(player, baitItem);
      }
      
      // Add as consumables
      await this.addConsumable({ id: omeggaPlayer.id }, 'Fish bait', oldBaitItems.length);
      
      this.omegga.whisper(speaker, `<color="0f0">Converted ${oldBaitItems.length} old bait items to new Fish bait consumables!</color>`);
      console.log(`[DEBUG] Converted ${oldBaitItems.length} old bait items for player ${speaker}`);
      
    } catch (error) {
      console.error(`[Hoopla RPG] Error converting bait:`, error);
      this.omegga.whisper(speaker, `<color="f00">Error converting bait: ${error.message}</color>`);
    }
  }

  /**
   * Handle RPG teams command
   */
  private async handleRPGTeams(speaker: string): Promise<void> {
    try {
      const player = this.omegga.getPlayer(speaker);
      if (!player) return;

        const minigames = await this.omegga.getMinigames();
      const teamCount = minigames.length;
        
      if (teamCount === 0) {
        this.omegga.whisper(speaker, `<color="888">No teams found.</color>`);
          return;
        }

      this.omegga.whisper(speaker, `<color="0ff">Found ${teamCount} teams:</color>`);
      
      minigames.forEach((team, index) => {
        const teamName = team.name || `Team ${index + 1}`;
        const playerCount = (team as any).players?.length || 0;
        this.omegga.whisper(speaker, `<color="fff">${teamName}: ${playerCount} players</color>`);
      });
      } catch (error) {
      console.error(`[Hoopla RPG] Error getting teams:`, error);
      this.omegga.whisper(speaker, `<color="f00">Error getting teams: ${error.message}</color>`);
    }
  }

  /**
   * Handle RPG assign level 30 roles command
   */
  private async handleRPGAssignLevel30Roles(speaker: string): Promise<void> {
    try {
      const player = this.omegga.getPlayer(speaker);
      if (!player) return;

      this.omegga.whisper(speaker, `<color="0ff">Assigning level 30 players to Flyer and MINIGAME LEAVER roles...</color>`);

      const allPlayerIds = await this.store.get("all_player_ids") as unknown as string[] || [];
        let assignedCount = 0;

      for (const playerId of allPlayerIds) {
        try {
          const playerData = await this.playerService.getPlayerData({ id: playerId });
          if (playerData.level >= 30) {
            const onlinePlayer = this.omegga.getPlayer(playerId);
            if (onlinePlayer) {
              // Assign Flyer role
              await (this.omegga as any).setRole(onlinePlayer.name, "Flyer");
              // Assign MINIGAME LEAVER role
              await (this.omegga as any).setRole(onlinePlayer.name, "MINIGAME LEAVER");
              assignedCount++;
            }
            }
          } catch (error) {
          console.log(`[Hoopla RPG] Error assigning roles to player ${playerId}:`, error);
        }
      }

      this.omegga.whisper(speaker, `<color="0f0">Assigned roles to ${assignedCount} level 30+ players!</color>`);
       } catch (error) {
      console.error(`[Hoopla RPG] Error assigning level 30 roles:`, error);
      this.omegga.whisper(speaker, `<color="f00">Error assigning roles: ${error.message}</color>`);
    }
  }

  /**
   * Handle RPG clean inventories command
   */
  private async handleRPGCleanInventories(speaker: string): Promise<void> {
    try {
      const player = this.omegga.getPlayer(speaker);
      if (!player) return;

      this.omegga.whisper(speaker, `<color="0ff">Cleaning all player inventories...</color>`);

      const allPlayerIds = await this.store.get("all_player_ids") as unknown as string[] || [];
      let cleanedCount = 0;

      for (const playerId of allPlayerIds) {
        try {
          const playerData = await this.playerService.getPlayerData({ id: playerId });
          if (playerData.inventory && playerData.inventory.length > 0) {
            playerData.inventory = [];
            await this.playerService.setPlayerData({ id: playerId }, playerData);
            cleanedCount++;
          }
          } catch (error) {
          console.log(`[Hoopla RPG] Error cleaning inventory for player ${playerId}:`, error);
        }
      }

      this.omegga.whisper(speaker, `<color="0f0">Cleaned inventories for ${cleanedCount} players!</color>`);
       } catch (error) {
      console.error(`[Hoopla RPG] Error cleaning all inventories:`, error);
      this.omegga.whisper(speaker, `<color="f00">Error cleaning inventories: ${error.message}</color>`);
    }
  }

  /**
   * Handle RPG clean inventory command
   */
  private async handleRPGCleanInventory(speaker: string): Promise<void> {
    try {
      console.log(`[DEBUG] Cleaning inventory for player: ${speaker}`);
      const omeggaPlayer = this.omegga.getPlayer(speaker);
      if (!omeggaPlayer) {
        this.omegga.whisper(speaker, "Player not found.");
        return;
      }
      
      const player = await this.playerService.getPlayerData({ id: omeggaPlayer.id });
      
      if (!player || !player.inventory) {
        this.omegga.whisper(speaker, "No inventory found to clean.");
        return;
      }
      
      const originalInventory = [...player.inventory];
      let cleanedCount = 0;
      
      // Clean up fish names
      const fishNameMap: { [key: string]: string } = {
        'lionfish': 'Lionfish',
        'sea dragon': 'Sea Dragon', 
        'angelfish': 'Angelfish',
        'clownfish': 'Clownfish',
        'gup': 'Gup',
        'cod': 'Cod',
        'shark': 'Shark',
        'whale': 'Whale',
        'kraken': 'Kraken',
        'sardine': 'Sardine',
        'tuna': 'Tuna',
        'marlin': 'Marlin',
        'megalodon': 'Megalodon',
        'leviathan': 'Leviathan',
        'manta ray': 'Manta Ray',
        'icefish': 'Icefish',
        'arctic char': 'Arctic Char',
        'beluga': 'Beluga',
        'narwhal': 'Narwhal',
        'frost kraken': 'Frost Kraken'
      };
      
      // Clean up ore names
      const oreNameMap: { [key: string]: string } = {
        'copper': 'Copper Ore',
        'iron': 'Iron Ore',
        'gold': 'Gold Ore',
        'diamond': 'Diamond Ore',
        'obsidian': 'Obsidian Ore'
      };
      
      // Clean up quest item names
      const questNameMap: { [key: string]: string } = {
        'brickingway box': 'Brickingway Box',
        'ice box': 'Ice Box',
        'ice chest': 'Ice Chest',
        'ice crystal': 'Ice Crystal',
        'ice crown': 'Ice Crown',
        'frozen heart': 'Frozen Heart'
      };
      
      // Combine all mappings
      const nameMap = { ...fishNameMap, ...oreNameMap, ...questNameMap };
      
      // Clean the inventory
      player.inventory = player.inventory.map(item => {
        const lowerItem = item.toLowerCase();
        if (nameMap[lowerItem]) {
          cleanedCount++;
          return nameMap[lowerItem];
        }
        return item;
      });
      
      // Save the cleaned inventory
      await this.playerService.setPlayerData({ id: omeggaPlayer.id }, player);
      
      this.omegga.whisper(speaker, `<color="0f0">Inventory cleaned! Fixed ${cleanedCount} item names.</color>`);
      console.log(`[DEBUG] Cleaned ${cleanedCount} items for player ${speaker}`);
      
    } catch (error) {
      console.error(`[Hoopla RPG] Error cleaning inventory:`, error);
      this.omegga.whisper(speaker, "An error occurred while cleaning your inventory.");
    }
  }

  /**
   * Handle RPG normalize items command
   */
  private async handleRPGNormalizeItems(speaker: string): Promise<void> {
    try {
      const player = this.omegga.getPlayer(speaker);
      if (!player) return;

      this.omegga.whisper(speaker, `<color="0ff">Normalizing all player inventories...</color>`);

      const allPlayerIds = await this.store.get("all_player_ids") as unknown as string[] || [];
      let normalizedCount = 0;
      let totalItemsNormalized = 0;

      for (const playerId of allPlayerIds) {
        try {
          const playerData = await this.playerService.getPlayerData({ id: playerId });
          if (playerData.inventory && playerData.inventory.length > 0) {
            const originalInventory = [...playerData.inventory];
            const normalizedInventory = playerData.inventory.map(item => this.normalizeItemName(item));
            
            // Count how many items were actually changed
            let itemsChanged = 0;
            for (let i = 0; i < originalInventory.length; i++) {
              if (originalInventory[i] !== normalizedInventory[i]) {
                itemsChanged++;
              }
            }
            
            if (itemsChanged > 0) {
              playerData.inventory = normalizedInventory;
              await this.playerService.setPlayerData({ id: playerId }, playerData);
              normalizedCount++;
              totalItemsNormalized += itemsChanged;
            }
          }
        } catch (error) {
          console.log(`[Hoopla RPG] Error normalizing inventory for player ${playerId}:`, error);
        }
      }

      this.omegga.whisper(speaker, `<color="0f0">Normalized ${normalizedCount} player inventories!</color>`);
      this.omegga.whisper(speaker, `<color="0f0">Total items normalized: ${totalItemsNormalized}</color>`);
    } catch (error) {
      console.error(`[Hoopla RPG] Error normalizing items:`, error);
      this.omegga.whisper(speaker, `<color="f00">Error normalizing items: ${error.message}</color>`);
    }
  }

  // ============================================================================
  // MISSING UTILITY METHODS
  // ============================================================================

  /**
   * Initialize RPG on interaction
   */
  private async initializeRPGOnInteraction(): Promise<void> {
    try {
      // This method would initialize the RPG system
      // For now, just log that it was called
      console.log("[Hoopla RPG] RPG system initialized on interaction");
    } catch (error) {
      console.error("[Hoopla RPG] Error initializing RPG on interaction:", error);
      throw error;
    }
  }

  /**
   * Fix overleveled player
   */
  private async fixOverleveledPlayer(playerId: string): Promise<void> {
    try {
      const player = await this.playerService.getPlayerData({ id: playerId });
      
      // Check if player is over level 30
      if (player.level > 30) {
        player.level = 30;
        player.experience = this.getXPForLevel(30);
        await this.playerService.setPlayerData({ id: playerId }, player);
        console.log(`[Hoopla RPG] Fixed overleveled player ${playerId} to level 30`);
      }
    } catch (error) {
      console.error(`[Hoopla RPG] Error fixing overleveled player ${playerId}:`, error);
      throw error;
    }
  }

  /**
   * Get brick triggers
   */
  private async getBrickTriggers(): Promise<{ [triggerId: string]: any }> {
    const data = await this.store.get("brick_triggers_data");
    return data && typeof data === 'object' ? (data as any) : {};
  }

  /**
   * Set brick triggers
   */
  private async setBrickTriggers(triggers: { [triggerId: string]: any }): Promise<void> {
    await this.store.set("brick_triggers_data", triggers as any);
  }

  /**
   * Save individual trigger data
   */
  private async saveTriggerData(triggerId: string, trigger: any): Promise<void> {
    const triggers = await this.getBrickTriggers();
    // Deep copy the trigger to ensure isolation
    triggers[triggerId] = JSON.parse(JSON.stringify(trigger));
    await this.setBrickTriggers(triggers);
  }

  /**
   * Plugin cleanup
   */
  async stop() {
    console.log("[Hoopla RPG] Stopping modular RPG system...");
    
    // Clean up any resources if needed
    
    console.log("[Hoopla RPG] Modular RPG system stopped successfully!");
  }

  /**
   * Return registered commands
   */
  get registeredCommands() {
    return [
      "rpg", "rpginit", "rpghelp", "rpgclearall", "rpgcleartriggers", "rpgclearquests",
      "rpgresetquests", "rpgresetquestitems", "rpgassignlevel30roles", "rpgteams", "rpgcleaninventories", 
      "rpgcleaninventory", "rpginventory", "rpgnormalizeitems", "mininginfo", "fishinginfo", "rpgleaderboard",
      "rpgfixlevel", "rpgadmin"
    ];
  }

  /**
   * Get XP for next level
   */
  private getXPForNextLevel(level: number): number {
    if (level <= 5) return 100 + (level - 1) * 50; // 100, 150, 200, 250, 300
    if (level <= 10) return 300 + (level - 5) * 100; // 350, 450, 550, 650, 750
    if (level <= 15) return 750 + (level - 10) * 150; // 900, 1050, 1200, 1350, 1500
    if (level <= 20) return 1500 + (level - 15) * 200; // 1700, 1900, 2100, 2300, 2500
    if (level <= 25) return 2500 + (level - 20) * 300; // 2800, 3100, 3400, 3700, 4000
    if (level <= 30) return 4000 + (level - 25) * 500; // 4500, 5000, 5500, 6000, 6500
    return 6500; // Max level
  }

  /**
   * Get skill progress information
   */
  private async getSkillProgress(playerId: { id: string }, skillType: 'mining' | 'bartering' | 'fishing'): Promise<{
    level: number;
    experience: number;
    xpForNextLevel: number;
    progress: number;
  }> {
    const player = await this.playerService.getPlayerData(playerId);
    const skill = player.skills[skillType] || { level: 0, experience: 0 };
    
    const xpForNextLevel = this.getXPForNextLevel(skill.level);
    const progress = skill.level >= 30 ? 100 : 
      Math.min(100, Math.max(0, (skill.experience / xpForNextLevel) * 100));
    
    return {
      level: skill.level,
      experience: skill.experience,
      xpForNextLevel,
      progress
    };
  }

  /**
   * Get XP within current skill level
   */
  private getXPInCurrentSkillLevel(level: number, totalXP: number): number {
    if (level <= 1) return totalXP;
    
    let xpForCurrentLevel = 0;
    for (let i = 1; i < level; i++) {
      xpForCurrentLevel += this.getXPForNextLevel(i);
    }
    
    const xpInLevel = totalXP - xpForCurrentLevel;
    return Math.max(0, xpInLevel); // Ensure we don't show negative values
  }
}
