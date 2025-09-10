/**
 * Quest Service
 * 
 * Handles quest management, quest chains, requirements checking,
 * and quest completion for the RPG system.
 */

import { OL, PS } from "omegga";
import { PlayerId, RPGPlayer, PlayerService } from '../player/PlayerService';
import { MessagingService } from '../utils/Messaging';
import { ExperienceService } from '../progression/ExperienceService';
import { InventoryService } from '../player/InventoryService';

// Quest type definitions
export type QuestRequirement = {
  id: string;
  type: 'item' | 'kill' | 'level' | 'skill';
  target: string; // Item name, enemy name, level number, or skill name
  amount: number; // How many items, kills, or level required
  description: string; // Human-readable description
};

export type QuestProgress = {
  questId: string;
  status: 'not_started' | 'in_progress' | 'completed';
  requirements: QuestRequirement[];
  completedRequirements: string[]; // Track which requirements are met
  interactionStep: number; // Track which step of the quest interaction we're on
};

export type Quest = {
  id: string;
  name: string;
  description: string;
  requirements: QuestRequirement[];
  rewards: {
    xp: number;
    currency: number;
    items?: string[];
  };
  questgiver: {
    name: string;
    personality: string;
    greeting: string;
    questExplanation: string;
    reminderMessage: string;
    completionMessage: string;
  };
};

/**
 * Service class for managing quests and quest progression
 */
export class QuestService {
  private omegga: OL;
  private store: PS<any>;
  private messagingService: MessagingService;
  private playerService: PlayerService;
  private experienceService: ExperienceService;
  private inventoryService: InventoryService;
  private resourceService: any; // ResourceService for getting item colors
  private currencyService: any; // Currency service for handling currency operations

  constructor(omegga: OL, store: PS<any>, messagingService: MessagingService, playerService: PlayerService, experienceService: ExperienceService, inventoryService: InventoryService, resourceService: any, currencyService: any) {
    this.omegga = omegga;
    this.store = store;
    this.messagingService = messagingService;
    this.playerService = playerService;
    this.experienceService = experienceService;
    this.inventoryService = inventoryService;
    this.resourceService = resourceService;
    this.currencyService = currencyService;
  }

  /**
   * Gets all available quests in the system
   * 
   * @returns Array of all quests
   */
  getAllQuests(): Quest[] {
    return [
      {
        id: 'john_brickington_1',
        name: 'John Brickington\'s Starter Pack',
        description: 'Help John Brickington get 5 Gups to start his fish business',
        requirements: [
          {
            id: 'gup_requirement',
            type: 'item',
            target: 'Gup',
            amount: 5,
            description: 'Collect 5 Gups from fishing'
          }
        ],
        rewards: {
          xp: 167,
          currency: 250
        },
        questgiver: {
          name: 'John Brickington',
          personality: 'A Gen Z fisherman who speaks in internet slang and brainrot terms while trying to sound professional about fish',
          greeting: 'Yo what\'s good fam! Names John Brickington and I\'m totally not sus at all. Just a regular fisherman trying to make it in this crazy world. You look like someone who knows their way around a fishing rod ngl.',
          questExplanation: 'So check it, I\'m starting this totally legit fish importing business right? My grandma left me this old fishing company and I need to get it running again. I need exactly 5 <color="fff">[Gup]</color> to show my business partners I\'m serious about this whole operation.',
          reminderMessage: 'Yo yo yo, still need those 5 <color="fff">[Gup]</color> fam! My business partners are getting kinda impatient and asking questions about the timeline. Just between us, they\'re kinda scary when mad so no pressure but also kinda pressure you know?',
          completionMessage: 'YOOO these Gups are absolutely bussin! My business partners are gonna be so impressed with the quality. You\'re literally carrying my whole operation right now! This is just the beginning though, I got bigger plans brewing.'
        }
      },
      {
        id: 'john_brickington_2',
        name: 'John Brickington\'s Cod Collection',
        description: 'Help John Brickington get 5 Cod for his expanding business',
        requirements: [
          {
            id: 'cod_requirement',
            type: 'item',
            target: 'Cod',
            amount: 5,
            description: 'Collect 5 Cod from fishing'
          }
        ],
        rewards: {
          xp: 250,
          currency: 400
        },
        questgiver: {
          name: 'John Brickington',
          personality: 'A Gen Z fisherman who speaks in internet slang and brainrot terms while trying to sound professional about fish',
          greeting: 'Yooo my guy is back! Bro those Gups were straight fire, my business partners were so impressed they want to expand operations immediately. You\'ve got some serious fishing skills ngl.',
          questExplanation: 'Okay so like, plot twist time! My business partners want to expand into the premium fish market. They\'re asking for exactly 5 <color="0f0">[Cod]</color> this time because apparently they have some very specific clients with very specific tastes. These clients sound kinda weird but they pay BANK so who am I to judge right?',
          reminderMessage: 'Yo still need those 5 <color="0f0">[Cod]</color>! My business partners keep asking me about the timeline and honestly they\'re starting to give me weird vibes. They keep talking about some project called Operation Fishbowl but like, probably just a code name right?',
          completionMessage: 'Yooo these Cod are perfect! My business partners just called and they\'re absolutely losing their minds over the quality. They said something about the specimens being ideal for the next phase of Operation Fishbowl. Just fancy business talk though, right?'
        }
      },
      {
        id: 'john_brickington_3',
        name: 'John Brickington\'s Shark Showdown',
        description: 'Help John Brickington get 5 Sharks for his premium clientele',
        requirements: [
          {
            id: 'shark_requirement',
            type: 'item',
            target: 'Shark',
            amount: 5,
            description: 'Collect 5 Sharks from fishing'
          }
        ],
        rewards: {
          xp: 333,
          currency: 600
        },
        questgiver: {
          name: 'John Brickington',
          personality: 'A Gen Z fisherman who speaks in internet slang and brainrot terms while trying to sound professional about fish',
          greeting: 'Yooo you\'re back! Okay so like, don\'t freak out but I think my business partners might not be who they said they were. They keep asking really weird questions about the fish and they have these fancy lab coats and clipboards. But hey, money is money right?',
          questExplanation: 'Okay so like, things are getting kinda sus but hear me out. My business partners want 5 <color="08f">[Shark]</color> now and they keep talking about genetic sequencing and marine biology research. I asked them about it and they just laughed nervously and changed the subject. But like, they\'re paying me triple now so I\'m not asking too many questions.',
          reminderMessage: 'Yo still need those 5 <color="08f">[Shark]</color>! My business partners showed up at my house yesterday with a whole van full of scientific equipment. They said they need to test the fish for purity levels or something. I\'m starting to think this isn\'t a normal fish business but the money is too good to stop now.',
          completionMessage: 'Yooo these Sharks are perfect! My business partners just took them away in some kind of refrigerated truck with government plates. They said something about Phase 3 of the marine enhancement project. I\'m getting really worried but they just doubled my payment again so like, I guess we\'re in too deep now?'
        }
      },
      {
        id: 'john_brickington_4',
        name: 'John Brickington\'s Whale Wonder',
        description: 'Help John Brickington get 5 Whales for his elite clientele',
        requirements: [
          {
            id: 'whale_requirement',
            type: 'item',
            target: 'Whale',
            amount: 5,
            description: 'Collect 5 Whales from fishing'
          }
        ],
        rewards: {
          xp: 417,
          currency: 800
        },
        questgiver: {
          name: 'John Brickington',
          personality: 'A Gen Z fisherman who speaks in internet slang and brainrot terms while trying to sound professional about fish',
          greeting: 'Yooo okay so like, I need to tell you something kinda crazy. I found out my business partners aren\'t actually business partners. They\'re government scientists working on some top secret marine life project. But they\'re paying me so much money I don\'t even care anymore lmao.',
          questExplanation: 'Okay so like, the government scientists need 5 Whales for the final phase of their experiment. They told me they\'re trying to create some kind of super intelligent marine ecosystem or something wild like that. I\'m pretty sure we\'re helping them build an underwater army but the money is so good.',
          reminderMessage: 'Yo still need those 5 Whales! The government scientists keep calling me every hour asking about the timeline. They said something about needing to synchronize the Whales with the other marine specimens for the final phase. I\'m starting to think we might be in over our heads but like, YOLO right?',
          completionMessage: 'Yooo these Whales are incredible! The government scientists just arrived with a whole convoy of trucks and helicopters. They said the Whales are the key to completing their marine intelligence network. I think we just helped them create some kind of underwater surveillance system but hey, we\'re rich now!'
        }
      },
      {
        id: 'john_brickington_5',
        name: 'John Brickington\'s Kraken Quest',
        description: 'Help John Brickington get 1 Kraken for his ultimate client',
        requirements: [
          {
            id: 'kraken_requirement',
            type: 'item',
            target: 'Kraken',
            amount: 1,
            description: 'Collect 1 Kraken from fishing'
          }
        ],
        rewards: {
          xp: 667,
          currency: 1500
        },
        questgiver: {
          name: 'John Brickington',
          personality: 'A Gen Z fisherman who speaks in internet slang and brainrot terms while trying to sound professional about fish',
          greeting: 'Yooo my guy! Okay so like, I have a confession to make. I\'ve been lying to you this whole time. I\'m not actually John Brickington the fisherman. I\'m Agent John Brickington, undercover marine biologist for a top secret government project. Sorry for the deception!',
          questExplanation: 'Okay so like, the truth is we\'ve been building a massive underwater communication network using marine life as biological transmitters. The Kraken is the final piece we need to complete Operation Fishbowl. It\'s gonna be the central hub that controls all the other fish we\'ve collected. You\'ve been helping save the world this whole time!',
          reminderMessage: 'Yo still need that Kraken! My team at the lab is getting antsy because we need to activate the network before the enemy discovers what we\'re doing. The fate of underwater national security literally depends on this one Kraken. No pressure though lmao.',
          completionMessage: 'YOOO WE DID IT! Operation Fishbowl is complete! The Kraken just connected to our network and we now have full underwater surveillance coverage of the entire ocean. You literally just helped us create the world\'s first biological internet! My real name is Agent Brickington and you\'ve been recruited as an honorary marine intelligence operative. Welcome to the team, no cap!'
        }
      },
      {
        id: 'frank_bricktavious_1',
        name: 'Frank Bricktavious\'s Copper Foundation',
        description: 'Help Frank Bricktavious get 10 Copper Ore to start his monument project',
        requirements: [
          {
            id: 'copper_requirement',
            type: 'item',
            target: 'Copper Ore',
            amount: 10,
            description: 'Collect 10 Copper Ore from mining'
          }
        ],
        rewards: {
          xp: 200,
          currency: 300
        },
        questgiver: {
          name: 'Frank Bricktavious',
          personality: 'A retired mining engineer with a thick southern accent who speaks like an old-timey prospector but uses modern slang',
          greeting: 'Well howdy there, partner! Name\'s Frank Bricktavious, retired mining engineer extraordinaire. I been workin\' these mines for nigh on forty years, and I reckon you look like someone who knows their way around a pickaxe.',
          questExplanation: 'See here, I\'m buildin\' myself a mighty fine monument to my legacy as the greatest miner this side of the Mississippi. I need exactly 10 pieces of <color="fff">[Copper Ore]</color> to get the foundation started. This here monument\'s gonna be the talk of the town, no cap!',
          reminderMessage: 'Howdy again! Still workin\' on gatherin\' those 10 <color="fff">[Copper Ore]</color> pieces for my monument? No rush, but I\'m gettin\' mighty excited to see this thing come together. Just make sure they\'re good quality ore, ya hear?',
          completionMessage: 'Well I\'ll be! These Copper Ore pieces are absolutely magnificent! You\'ve got the eye of a true miner, my friend. This foundation is gonna be rock solid, literally! I can already see my monument takin\' shape in my mind\'s eye.'
        }
      },
      {
        id: 'frank_bricktavious_2',
        name: 'Frank Bricktavious\'s Iron Framework',
        description: 'Help Frank Bricktavious get 10 Iron Ore for the monument\'s framework',
        requirements: [
          {
            id: 'iron_requirement',
            type: 'item',
            target: 'Iron Ore',
            amount: 10,
            description: 'Collect 10 Iron Ore from mining'
          }
        ],
        rewards: {
          xp: 300,
          currency: 500
        },
        questgiver: {
          name: 'Frank Bricktavious',
          personality: 'A retired mining engineer with a thick southern accent who speaks like an old-timey prospector but uses modern slang',
          greeting: 'Well howdy there, partner! That Copper foundation you brought me is lookin\' mighty fine. I been tellin\' everyone in town about the skilled miner who\'s helpin\' me build my legacy monument.',
          questExplanation: 'Now we need to move on to the framework, and for that I need exactly 10 pieces of <color="0f0">[Iron Ore]</color>. This here monument\'s gonna be so sturdy it\'ll last a thousand years! I been dreamin\' about this day since I first picked up a pickaxe as a young whippersnapper.',
          reminderMessage: 'Howdy again! Still workin\' on gatherin\' those 10 <color="0f0">[Iron Ore]</color> pieces for the framework? I been measurin\' and plannin\' all day, and I reckon this monument\'s gonna be the most impressive thing this town has ever seen!',
          completionMessage: 'Hot diggity! These Iron Ore pieces are exactly what I needed! The framework is gonna be so strong it could hold up a mountain. You\'re turnin\' out to be quite the mining partner, I tell ya what!'
        }
      },
      {
        id: 'frank_bricktavious_3',
        name: 'Frank Bricktavious\'s Golden Glory',
        description: 'Help Frank Bricktavious get 10 Gold Ore for the monument\'s golden accents',
        requirements: [
          {
            id: 'gold_requirement',
            type: 'item',
            target: 'Gold Ore',
            amount: 10,
            description: 'Collect 10 Gold Ore from mining'
          }
        ],
        rewards: {
          xp: 400,
          currency: 700
        },
        questgiver: {
          name: 'Frank Bricktavious',
          personality: 'A retired mining engineer with a thick southern accent who speaks like an old-timey prospector but uses modern slang',
          greeting: 'Well howdy there, partner! That Iron framework is lookin\' absolutely spectacular! I been gettin\' so many compliments from folks passin\' by. They can\'t believe how fast this monument is comin\' together.',
          questExplanation: 'Now for the real showstopper - I need exactly 10 pieces of <color="08f">[Gold Ore]</color> for the golden accents. This here monument\'s gonna shine brighter than the sun itself! I want people to see it from miles away and know that Frank Bricktavious built something truly magnificent.',
          reminderMessage: 'Howdy again! Still workin\' on gatherin\' those 10 <color="08f">[Gold Ore]</color> pieces for the golden accents? I been polishin\' the plans and I reckon this monument\'s gonna be so shiny it\'ll blind folks with its beauty!',
          completionMessage: 'Well butter my biscuit! These Gold Ore pieces are absolutely gorgeous! The golden accents are gonna make this monument look like it came straight out of a fairy tale. You\'re makin\' an old miner\'s dreams come true!'
        }
      },
      {
        id: 'frank_bricktavious_4',
        name: 'Frank Bricktavious\'s Obsidian Opulence',
        description: 'Help Frank Bricktavious get 10 Obsidian Ore for the monument\'s dark accents',
        requirements: [
          {
            id: 'obsidian_requirement',
            type: 'item',
            target: 'Obsidian Ore',
            amount: 10,
            description: 'Collect 10 Obsidian Ore from mining'
          }
        ],
        rewards: {
          xp: 500,
          currency: 900
        },
        questgiver: {
          name: 'Frank Bricktavious',
          personality: 'A retired mining engineer with a thick southern accent who speaks like an old-timey prospector but uses modern slang',
          greeting: 'Well howdy there, partner! That Gold Ore you brought me is makin\' this monument shine like a beacon of hope! I been gettin\' visitors from three counties over just to see the progress.',
          questExplanation: 'Now I need exactly 10 pieces of <color="80f">[Obsidian Ore]</color> for the dark accents. This here monument\'s gonna have the perfect contrast - bright gold and deep obsidian black. It\'ll be like a work of art that tells the story of my forty years in the mines.',
          reminderMessage: 'Howdy again! Still workin\' on gatherin\' those 10 <color="80f">[Obsidian Ore]</color> pieces for the dark accents? I been thinkin\' about the design and I reckon this contrast between gold and obsidian is gonna be absolutely breathtaking!',
          completionMessage: 'Well I\'ll be hornswoggled! These Obsidian Ore pieces are exactly what I needed! The contrast between the gold and obsidian is gonna be so striking it\'ll take folks\' breath away. You\'re helpin\' me create a true masterpiece!'
        }
      },
      {
        id: 'frank_bricktavious_5',
        name: 'Frank Bricktavious\'s Diamond Destiny',
        description: 'Help Frank Bricktavious get 1 Diamond Ore for the monument\'s crown jewel',
        requirements: [
          {
            id: 'diamond_requirement',
            type: 'item',
            target: 'Diamond Ore',
            amount: 1,
            description: 'Collect 1 Diamond Ore from mining'
          }
        ],
        rewards: {
          xp: 833,
          currency: 2000
        },
        questgiver: {
          name: 'Frank Bricktavious',
          personality: 'A retired mining engineer with a thick southern accent who speaks like an old-timey prospector but uses modern slang',
          greeting: 'Well howdy there, partner! This monument is lookin\' absolutely magnificent! I been gettin\' so emotional thinkin\' about what this represents. But I got one final request that\'ll make this monument truly legendary.',
          questExplanation: 'I need exactly 1 piece of <color="f80">[Diamond Ore]</color> for the crown jewel of my monument. This here diamond\'s gonna be the centerpiece that represents all my years of hard work and dedication to the mining craft. It\'ll be the final touch that makes this monument a true testament to the mining life.',
          reminderMessage: 'Howdy again! Still workin\' on findin\' that 1 <color="f80">[Diamond Ore]</color> for the crown jewel? I know it\'s a tall order, but this diamond\'s gonna be the perfect finishing touch to my legacy monument. No pressure, but it\'s the most important piece of all!',
          completionMessage: 'WELL I\'LL BE DARNED! This Diamond Ore is absolutely perfect! My monument is finally complete, and it\'s more beautiful than I ever dreamed possible. You\'ve helped me create something that\'ll stand as a testament to the mining life for generations to come. Thank you, partner, from the bottom of my heart!'
        }
      },
      {
        id: 'emmet_brickingway_1',
        name: 'Emmet Brickingway\'s Lost Manuscripts',
        description: 'Help Emmet Brickingway recover his lost Brickingway Boxes containing the truth about the island\'s sudden appearance',
        requirements: [
          {
            id: 'brickingway_box_requirement',
            type: 'item',
            target: 'Brickingway Box',
            amount: 10,
            description: 'Collect 10 Brickingway Boxes containing the only record of the island\'s mysterious appearance'
          }
        ],
        rewards: {
          xp: 1000,
          currency: 2000
        },
        questgiver: {
          name: 'Emmet Brickingway',
          personality: 'A weathered writer with a Hemingway-esque stoicism, speaks in short, powerful sentences with deep meaning. He carries the weight of lost stories and unfinished works.',
          greeting: 'Sit down. I have a story to tell you. Not about war or bullfighting, but about mystery. About how this very island came to be. I was exploring the local waterfall yesterday, seeking inspiration in the roar of falling water. But the current was strong, and my manuscripts were scattered. My life\'s work, lost in the mist. There\'s something about that waterfall... something that shouldn\'t exist. But I cannot speak of it until my stories are whole again.',
          questExplanation: 'I need you to find my <color="ff0">[Brickingway Box]</color>es. You must collect exactly 10 of them to complete this quest. Each contains fragments of stories I never finished. Stories of courage, of loss, of the human condition. But more than that... they contain the truth about this place. Look for them near the waterfall and in the surrounding area. Start your search at the waterfall itself. The water may have carried them downstream, or they may be hidden among the rocks and trees nearby. Search carefully - they are small wooden boxes with my name carved into them. They are not just boxes. They are pieces of my soul, and pieces of a secret that will shake you to your core.',
          reminderMessage: 'The boxes are still out there, near the waterfall and beyond. You need to find all 10 <color="ff0">[Brickingway Box]</color>es to complete this quest. Each one you find brings me closer to completing what I started. The stories must be told. They demand to be heard. Have you searched the waterfall area thoroughly? Look for small wooden boxes with my name carved into them. How many have you found so far? The truth about this island waits in those boxes, and it will change everything you think you know.',
          completionMessage: 'You have done what I could not. You have brought my stories home from the waterfall\'s embrace. Now I can tell you the truth. This island did not exist a week ago. It simply appeared, fully formed, as if it had always been here. But it hadn\'t. I was there when it materialized from nothing. The waterfall you searched? It was the first thing I saw when this impossible place came into being. My boxes contained the only record of what happened that day - the day the world changed forever. Thank you, friend. The stories will live again, and now you know the impossible truth.'
        }
      },
      {
        id: 'ice_king_1',
        name: 'Ice King\'s Frozen Memories',
        description: 'Help the Ice King retrieve 4 Ice Boxes from around the ice mountain',
        requirements: [
          {
            id: 'ice_box_requirement',
            type: 'item',
            target: 'Ice Box',
            amount: 4,
            description: 'Collect 4 Ice Boxes from around the ice mountain'
          }
        ],
        rewards: {
          xp: 800,
          currency: 2000
        },
        questgiver: {
          name: 'Ice King',
          personality: 'A massive icy dragon with crystalline scales and piercing blue eyes, driven by an insatiable hunger for power. Speaks with the authority of an ancient predator, using dragon-like speech patterns with growls and hisses.',
          greeting: '*The massive icy dragon raises its crystalline head, frost billowing from its nostrils* Hssss... Another mortal dares to approach the Ice King\'s domain? *claws scrape against frozen stone* I sense... potential in you, little one. My hunger for power has led me to seek artifacts of great magical potency. Perhaps you could be... useful.',
          questExplanation: '*Dragon eyes gleam with cold hunger* My <color="ff0">[Ice Box]</color>es... they contain fragments of my former power, scattered across this mountain when I was defeated long ago. I need exactly 4 of them to begin reclaiming what was stolen from me. Each box holds a piece of my draconic essence, frozen in time. With them, I can begin the ritual to restore my true form and power. The ice mountain itself was created by my defeat - a monument to my weakness. But no longer!',
          reminderMessage: '*Frost breath swirls around the dragon\'s maw* My <color="ff0">[Ice Box]</color>es still lie scattered across this frozen wasteland! I need all 4 of them to begin my ascension. The mountain trembles with my growing power, but without those artifacts, I remain trapped in this weakened state. Bring them to me, and I shall reward you beyond your wildest dreams!',
          completionMessage: '*The dragon\'s eyes blaze with cold fire* EXCELLENT! My <color="ff0">[Ice Box]</color>es! *massive claws clutch the artifacts* I can feel my power returning! But this is only the beginning... I need something more powerful still. The Nether holds artifacts of fire magic that, when combined with my ice essence, will make me unstoppable! The ritual requires an <color="ff0">[Ice Chest]</color> from that realm of flame and shadow.'
        }
      },
      {
        id: 'ice_king_2',
        name: 'Ice King\'s Nether Ritual',
        description: 'Help the Ice King retrieve an Ice Chest from the Nether dimension',
        requirements: [
          {
            id: 'ice_chest_requirement',
            type: 'item',
            target: 'Ice Chest',
            amount: 1,
            description: 'Collect 1 Ice Chest from the Nether dimension'
          }
        ],
        rewards: {
          xp: 1200,
          currency: 3000
        },
        questgiver: {
          name: 'Ice King',
          personality: 'A massive icy dragon with crystalline scales and piercing blue eyes, driven by an insatiable hunger for power. Speaks with the authority of an ancient predator, using dragon-like speech patterns with growls and hisses.',
          greeting: '*The dragon\'s massive form shifts, ice crystals tinkling like chimes* Hssss... You return, little one. The <color="ff0">[Ice Box]</color>es have awakened something within me... *frost breath swirls* I remember now! I was once the greatest of the Ancient Dragons, ruler of the frozen realms! But I was betrayed and defeated, my power scattered across dimensions!',
          questExplanation: '*Claws dig into frozen stone* The Nether holds the key to my ultimate power! An <color="ff0">[Ice Chest]</color> forged in the fires of that realm contains the essence of fire magic that, when combined with my ice essence, will make me the most powerful being in existence! I will rule not just this frozen mountain, but all realms - ice and fire, light and shadow! The chest is guarded by fire demons, but their flames cannot harm one who seeks true power!',
          reminderMessage: '*The dragon\'s roar echoes across the mountain* The <color="ff0">[Ice Chest]</color> still lies in the Nether, waiting for one brave enough to claim it! I know the dangers, but true power requires sacrifice! The portal in the volcano leads to that realm of flame. Bring me that chest, and I shall grant you a fraction of the power I will soon possess!',
          completionMessage: '*The dragon\'s eyes blaze with cold fire as it rises to its full height* MAGNIFICENT! The <color="ff0">[Ice Chest]</color>! *massive claws grasp the artifact* Now I can complete the ritual! *frost and flame swirl around the dragon* Behold, as the Ice King ascends to his true form! *the mountain trembles with growing power* I remember everything now... I was the Ancient Ice Dragon, betrayed by my own kind! But with fire and ice combined, I shall become the Eternal Dragon - ruler of all realms! Thank you, mortal. You have served the future ruler of all existence well!'
        }
      }
    ];
  }

  /**
   * Gets a quest by its ID
   * 
   * @param questId - The ID of the quest to retrieve
   * @returns The quest object or null if not found
   */
  getQuestById(questId: string): Quest | null {
    const quests = this.getAllQuests();
    
    // Strip rpg_quest_ prefix if present
    const cleanQuestId = questId.replace(/^rpg_quest_/, '');
    
    // Handle legacy quest ID - redirect to first quest in chain
    if (cleanQuestId === 'john_brickington') {
      return quests.find(quest => quest.id === 'john_brickington_1') || null;
    }
    
    // Handle Frank Bricktavious quest ID - redirect to first quest in chain
    if (cleanQuestId === 'frank_bricktavious') {
      return quests.find(quest => quest.id === 'frank_bricktavious_1') || null;
    }
    
    // Handle Emmet Brickingway quest ID - redirect to first quest in chain
    if (cleanQuestId === 'emmet_brickingway') {
      return quests.find(quest => quest.id === 'emmet_brickingway_1') || null;
    }
    
    // Handle Ice King quest ID - redirect to first quest in chain
    if (cleanQuestId === 'ice_king') {
      return quests.find(quest => quest.id === 'ice_king_1') || null;
    }
    
    return quests.find(quest => quest.id === cleanQuestId) || null;
  }

  /**
   * Determines which quest a player should interact with based on their quest progress
   * 
   * @param triggerMessage - The trigger message from the quest interaction
   * @param playerQuests - The player's quest data
   * @returns The quest ID the player should interact with
   */
  determineActiveQuest(triggerMessage: string, playerQuests: { [questId: string]: QuestProgress }): string {
    // Strip rpg_quest_ prefix if present
    const cleanMessage = triggerMessage.replace(/^rpg_quest_/, '');
    
    // Determine which quest chain to use based on the trigger message
    let questChain: string[] = [];
    if (cleanMessage === 'john_brickington' || cleanMessage.startsWith('john_brickington_')) {
      questChain = ['john_brickington_1', 'john_brickington_2', 'john_brickington_3', 'john_brickington_4', 'john_brickington_5'];
    } else if (cleanMessage === 'frank_bricktavious' || cleanMessage.startsWith('frank_bricktavious_')) {
      questChain = ['frank_bricktavious_1', 'frank_bricktavious_2', 'frank_bricktavious_3', 'frank_bricktavious_4', 'frank_bricktavious_5'];
    } else if (cleanMessage === 'emmet_brickingway' || cleanMessage.startsWith('emmet_brickingway_')) {
      questChain = ['emmet_brickingway_1'];
    } else if (cleanMessage === 'ice_king' || cleanMessage.startsWith('ice_king_')) {
      questChain = ['ice_king_1', 'ice_king_2'];
    }
    
    if (questChain.length === 0) {
      // Fallback to first quest in chain based on trigger message
      if (cleanMessage === 'john_brickington') return 'john_brickington_1';
      if (cleanMessage === 'frank_bricktavious') return 'frank_bricktavious_1';
      if (cleanMessage === 'emmet_brickingway') return 'emmet_brickingway_1';
      if (cleanMessage === 'ice_king') return 'ice_king_1';
      return cleanMessage; // Return as-is if no chain found
    }
    
    // Find the appropriate quest to interact with
    // Priority: 1) Incomplete quests, 2) Completed quests that need chain progression
    let foundIncompleteQuest = false;
    for (const chainQuestId of questChain) {
      const questState = playerQuests[chainQuestId];
      if (!questState || questState.status !== 'completed') {
        // Found an incomplete quest - use this one
        return chainQuestId;
      }
    }
    
    // If no incomplete quest found, check if all quests in the chain are completed
    const allQuestsCompleted = questChain.every(chainQuestId => {
      const questState = playerQuests[chainQuestId];
      return questState && questState.status === 'completed';
    });
    
    if (allQuestsCompleted) {
      // All quests completed - use the final quest for completion message
      return questChain[questChain.length - 1];
    } else {
      // Some quests still incomplete - find the first completed quest that needs chain progression
      for (const chainQuestId of questChain) {
        const questState = playerQuests[chainQuestId];
        if (questState && questState.status === 'completed' && questState.interactionStep === 3) {
          // Found a completed quest that needs chain progression - use this one
          return chainQuestId;
        }
      }
    }
    
    // Fallback to first quest in chain
    return questChain[0];
  }

  /**
   * Gets the next quest in a quest chain
   * 
   * @param currentQuestId - The ID of the current quest
   * @returns The ID of the next quest in the chain, or null if no next quest
   */
  getNextQuestInChain(currentQuestId: string): string | null {
    // John Brickington quest chain
    const johnQuestChain = [
      'john_brickington_1',
      'john_brickington_2', 
      'john_brickington_3',
      'john_brickington_4',
      'john_brickington_5'
    ];
    
    // Frank Bricktavious quest chain
    const frankQuestChain = [
      'frank_bricktavious_1',
      'frank_bricktavious_2',
      'frank_bricktavious_3',
      'frank_bricktavious_4',
      'frank_bricktavious_5'
    ];
    
    // Emmet Brickingway quest chain
    const emmetQuestChain = [
      'emmet_brickingway_1'
    ];
    
    // Ice King quest chain
    const iceKingQuestChain = [
      'ice_king_1',
      'ice_king_2'
    ];
    
    // Check each quest chain
    const johnIndex = johnQuestChain.indexOf(currentQuestId);
    if (johnIndex >= 0 && johnIndex < johnQuestChain.length - 1) {
      return johnQuestChain[johnIndex + 1];
    }
    
    const frankIndex = frankQuestChain.indexOf(currentQuestId);
    if (frankIndex >= 0 && frankIndex < frankQuestChain.length - 1) {
      return frankQuestChain[frankIndex + 1];
    }
    
    const emmetIndex = emmetQuestChain.indexOf(currentQuestId);
    if (emmetIndex >= 0 && emmetIndex < emmetQuestChain.length - 1) {
      return emmetQuestChain[emmetIndex + 1];
    }
    
    const iceKingIndex = iceKingQuestChain.indexOf(currentQuestId);
    if (iceKingIndex >= 0 && iceKingIndex < iceKingQuestChain.length - 1) {
      return iceKingQuestChain[iceKingIndex + 1];
    }
    
    return null; // No next quest in chain
  }

  /**
   * Checks if a player has completed all requirements for a quest
   * 
   * @param player - The player to check requirements for
   * @param quest - The quest to check requirements for
   * @returns Object containing completion status and completed requirements
   */
  checkQuestRequirements(player: RPGPlayer, quest: Quest): { completed: boolean; completedRequirements: string[] } {
    const completedRequirements: string[] = [];
    
    for (const requirement of quest.requirements) {
      let requirementMet = false;
      
      switch (requirement.type) {
        case 'item':
          const itemCount = player.inventory?.filter(item => 
            item.toLowerCase() === requirement.target.toLowerCase()
          ).length || 0;
          if (itemCount >= requirement.amount) {
            requirementMet = true;
          }
          break;
        case 'level':
          if (player.level >= requirement.amount) {
            requirementMet = true;
          }
          break;
        case 'skill':
          if (player.skills && player.skills[requirement.target as keyof typeof player.skills]) {
            const skill = player.skills[requirement.target as keyof typeof player.skills];
            if (skill.level >= requirement.amount) {
              requirementMet = true;
            }
          }
          break;
        case 'kill':
          // Kill requirements not implemented yet
          break;
      }
      
      if (requirementMet) {
        completedRequirements.push(requirement.id);
      }
    }
    
    return {
      completed: completedRequirements.length === quest.requirements.length,
      completedRequirements
    };
  }

  /**
   * Completes a quest and gives rewards to the player
   * 
   * @param playerId - The ID of the player completing the quest
   * @param quest - The quest being completed
   */
  async completeQuest(playerId: string, quest: Quest): Promise<void> {
    const player = await this.playerService.getPlayerData({ id: playerId });
    
    // Remove required items from inventory
    for (const requirement of quest.requirements) {
      if (requirement.type === 'item') {
        for (let i = 0; i < requirement.amount; i++) {
          await this.inventoryService.removeFromInventory(player, requirement.target);
        }
      }
    }
    
    // Save player data after removing items
    await this.playerService.setPlayerData({ id: playerId }, player);
    
    // Give rewards
    await this.experienceService.addExperience({ id: playerId }, quest.rewards.xp);
    await this.addCurrency(playerId, quest.rewards.currency);
    
    if (quest.rewards.items) {
      for (const item of quest.rewards.items) {
        await this.inventoryService.addToInventory(player, item);
      }
    }
    
    // Save player data after adding rewards
    await this.playerService.setPlayerData({ id: playerId }, player);
    
    // Mark quest as completed
    if (!player.quests) {
      player.quests = {};
    }
    
    player.quests[quest.id] = {
      questId: quest.id,
      status: 'completed',
      requirements: quest.requirements,
      completedRequirements: quest.requirements.map(req => req.id),
      interactionStep: 3
    };
    
    await this.playerService.setPlayerData({ id: playerId }, player);
    
    // Show reward message to the player
    await this.showQuestRewards(playerId, quest);
    
    // Announce quest completion to the server
    const playerName = this.omegga.getPlayer(playerId)?.name || "Unknown Player";
    this.omegga.broadcast(`<color="0f0">${playerName} has completed "${quest.name}" from ${quest.questgiver.name}!</color>`);
  }

  /**
   * Shows quest rewards to the player
   * 
   * @param playerId - The ID of the player
   * @param quest - The quest that was completed
   */
  private async showQuestRewards(playerId: string, quest: Quest): Promise<void> {
    try {
      const rewardMessages: string[] = [];
      
      // Add XP reward
      if (quest.rewards.xp > 0) {
        rewardMessages.push(`<color="0f0">+${quest.rewards.xp} XP</color>`);
      }
      
      // Add currency reward
      if (quest.rewards.currency > 0) {
        const formattedCurrency = await this.formatCurrency(quest.rewards.currency);
        rewardMessages.push(`<color="ff0">+${formattedCurrency}</color>`);
      }
      
      // Add item rewards
      if (quest.rewards.items && quest.rewards.items.length > 0) {
        for (const item of quest.rewards.items) {
          const itemColor = this.resourceService.getResourceColor(item);
          rewardMessages.push(`<color="${itemColor}">+[${item}]</color>`);
        }
      }
      
      if (rewardMessages.length > 0) {
        const rewardText = rewardMessages.join(' | ');
        this.omegga.middlePrint(playerId, `<color="ff0">Quest Rewards:</color> ${rewardText}`);
      }
    } catch (error) {
      console.error(`[Hoopla RPG] Error showing quest rewards:`, error);
    }
  }

  /**
   * Gets player data from storage or cache
   * 
   * @param playerId - The ID of the player to retrieve data for
   * @returns Promise resolving to the player's RPG data
   */
  private async getPlayerData({ id }: PlayerId): Promise<RPGPlayer> {
    return (await this.store.get("rpg_" + id)) ?? this.getDefaultPlayer();
  }

  /**
   * Saves player data to storage
   * 
   * @param playerId - The ID of the player to save data for
   * @param data - The player data to save
   */
  private async setPlayerData({ id }: PlayerId, data: RPGPlayer): Promise<void> {
    await this.store.set("rpg_" + id, data);
  }

  /**
   * Creates a default player object with initial values
   * 
   * @returns Default RPGPlayer object
   */
  private getDefaultPlayer(): RPGPlayer {
    return { 
      level: 1, 
      experience: 0, 
      health: 100, 
      maxHealth: 100,
      inventory: [],
      consumables: [],
      nodesCollected: [],
      quests: {},
      skills: {
        mining: { level: 0, experience: 0 },
        bartering: { level: 0, experience: 0 },
        fishing: { level: 0, experience: 0 }
      },
      unlockedItems: []
    };
  }


  /**
   * Safely add currency with fallback
   */
  private async addCurrency(playerId: string, amount: number): Promise<void> {
    try {
      if (!this.currencyService.plugin) {
        throw new Error("Currency plugin not loaded");
      }
      await this.currencyService.add(playerId, "currency", amount);
    } catch (error) {
      // Currency plugin not available
    }
  }

  /**
   * Safely format currency with fallback
   */
  private async formatCurrency(amount: number): Promise<string> {
    try {
      if (!this.currencyService.plugin) {
        throw new Error("Currency plugin not loaded");
      }
      return await this.currencyService.format(amount);
    } catch (error) {
      if (amount === 0) {
        return "Currency plugin not loaded";
      }
      return `$${amount.toLocaleString()}`;
    }
  }

  /**
   * Check if a quest can be completed
   * 
   * @param playerId - The ID of the player
   * @param quest - The quest to check
   * @returns True if the quest can be completed, false otherwise
   */
  async checkQuestCompletion(playerId: string, quest: Quest): Promise<boolean> {
    try {
      const player = await this.playerService.getPlayerData({ id: playerId });
      
      // Check each requirement
      for (const requirement of quest.requirements) {
        switch (requirement.type) {
          case 'item':
            const itemCount = player.inventory?.filter(item => item.toLowerCase() === requirement.target.toLowerCase()).length || 0;
            if (itemCount < requirement.amount) {
              return false;
            }
            break;
          case 'level':
            if ((player.level || 1) < requirement.amount) {
              return false;
            }
            break;
          case 'skill':
            const skillLevel = player.skills?.[requirement.target]?.level || 0;
            if (skillLevel < requirement.amount) {
              return false;
            }
            break;
        }
      }
      
      return true;
    } catch (error) {
      console.error(`[Hoopla RPG] Error checking quest completion:`, error);
      return false;
    }
  }

  /**
   * Handle special case where player has items from later quests but needs to complete earlier quests
   * This fixes the issue where players collect quest items out of order
   * 
   * @param playerId - The ID of the player
   * @param quest - The current quest being attempted
   * @returns True if the quest can be completed with special handling, false otherwise
   */
  async handleOutOfOrderQuestItems(playerId: string, quest: Quest): Promise<boolean> {
    try {
      const player = await this.playerService.getPlayerData({ id: playerId });
      
      // Special handling for Ice King quest chain
      if (quest.id === 'ice_king_1') {
        // Check if player has Ice Chest (quest 2 item) but not enough Ice Boxes (quest 1 item)
        const iceBoxCount = player.inventory?.filter(item => item.toLowerCase() === 'ice box').length || 0;
        const iceChestCount = player.inventory?.filter(item => item.toLowerCase() === 'ice chest').length || 0;
        
        if (iceBoxCount < 4 && iceChestCount >= 1) {
          // Player has quest 2 items but not quest 1 items - allow completion of quest 1
          // This handles the case where they collected items out of order
          console.log(`[Hoopla RPG] Special case: Player ${playerId} has Ice Chest but not enough Ice Boxes. Allowing quest 1 completion.`);
          return true;
        }
      }
      
      // Add more special cases for other quest chains if needed
      
      return false; // No special handling needed
    } catch (error) {
      console.error(`[Hoopla RPG] Error handling out-of-order quest items:`, error);
      return false;
    }
  }

  /**
   * Get quest progress message showing current progress
   * 
   * @param playerId - The ID of the player
   * @param quest - The quest to get progress for
   * @returns Progress message string
   */
  async getQuestProgressMessage(playerId: string, quest: Quest): Promise<string> {
    try {
      const player = await this.playerService.getPlayerData({ id: playerId });
      
      // Check each requirement and build progress message
      let progressMessages: string[] = [];
      
      for (const requirement of quest.requirements) {
        switch (requirement.type) {
          case 'item':
            const itemCount = player.inventory?.filter(item => item.toLowerCase() === requirement.target.toLowerCase()).length || 0;
            const remaining = Math.max(0, requirement.amount - itemCount);
            const itemColor = this.resourceService.getResourceColor(requirement.target);
            if (remaining > 0) {
              progressMessages.push(`You have collected <color="0f0">${itemCount}</color> out of <color="ff0">${requirement.amount}</color> <color="${itemColor}">[${requirement.target}]</color>. You still need <color="f00">${remaining}</color> more.`);
            } else {
              progressMessages.push(`You have collected all <color="0f0">${requirement.amount}</color> <color="${itemColor}">[${requirement.target}]</color>!`);
            }
            break;
          case 'level':
            const currentLevel = player.level || 1;
            if (currentLevel < requirement.amount) {
              progressMessages.push(`You need to reach level <color="ff0">${requirement.amount}</color>. Your current level: <color="0f0">${currentLevel}</color>.`);
            } else {
              progressMessages.push(`You have reached the required level <color="0f0">${requirement.amount}</color>!`);
            }
            break;
          case 'skill':
            const skillLevel = player.skills?.[requirement.target]?.level || 0;
            if (skillLevel < requirement.amount) {
              progressMessages.push(`You need <color="ff0">${requirement.target}</color> level <color="ff0">${requirement.amount}</color>. Your current level: <color="0f0">${skillLevel}</color>.`);
            } else {
              progressMessages.push(`You have reached the required <color="0f0">${requirement.target}</color> level <color="0f0">${requirement.amount}</color>!`);
            }
            break;
        }
      }
      
      const progressText = progressMessages.join('\n');
      return `<color="ff0">${quest.questgiver.name}</color>: ${quest.questgiver.reminderMessage}\n\n<color="0ff">Current Progress:</color>\n${progressText}`;
      
    } catch (error) {
      console.error(`[Hoopla RPG] Error getting quest progress message:`, error);
      return `<color="ff0">${quest.questgiver.name}</color>: ${quest.questgiver.reminderMessage}`;
    }
  }

  /**
   * Handles quest interactions - main entry point for quest logic
   * 
   * @param playerId - The ID of the player interacting with the quest
   * @param trigger - The trigger data from the brick interaction
   */
  async handleQuestInteraction(playerId: string, trigger: any): Promise<void> {
    try {
      const questPlayer = await this.playerService.getPlayerData({ id: playerId });
      const playerName = this.omegga.getPlayer(playerId)?.name || "Unknown Player";
      
      let questId = trigger.message; // Quest ID is stored in the message
      
      // Handle legacy quest ID - redirect to first quest in chain
      if (questId === 'john_brickington') {
        questId = 'john_brickington_1';
      } else if (questId === 'frank_bricktavious') {
        questId = 'frank_bricktavious_1';
      } else if (questId === 'emmet_brickingway') {
        questId = 'emmet_brickingway_1';
      } else if (questId === 'ice_king') {
        questId = 'ice_king_1';
      }
      
      // Determine which quest the player should be interacting with using QuestService
      if (questPlayer.quests) {
        questId = this.determineActiveQuest(trigger.message, questPlayer.quests);
      }
      
      // Get quest data
      console.log(`[DEBUG] Looking for quest with ID: ${questId}`);
      const quest = this.getQuestById(questId);
      if (!quest) {
        console.log(`[DEBUG] Quest not found: ${questId}`);
        this.omegga.whisper(playerId, `<color="f00">Quest not found: ${questId}</color>`);
        return;
      }
      console.log(`[DEBUG] Quest found: ${quest.name} (${quest.id})`);
      
      // Handle step-by-step quest interactions
      const currentQuest = questPlayer.quests?.[questId];
      console.log(`[DEBUG] Current quest state:`, currentQuest ? {
        questId: currentQuest.questId,
        status: currentQuest.status,
        interactionStep: currentQuest.interactionStep,
        completedRequirements: currentQuest.completedRequirements
      } : 'No existing quest found');
      
      if (!currentQuest) {
        // First time starting this quest - Step 1: Show greeting
        console.log(`[DEBUG] Starting new quest: ${questId}`);
        if (!questPlayer.quests) {
          questPlayer.quests = {};
        }
        questPlayer.quests[questId] = {
          questId: quest.id,
          status: 'in_progress',
          requirements: quest.requirements,
          completedRequirements: [],
          interactionStep: 1
        };
        await this.playerService.setPlayerData({ id: playerId }, questPlayer);
        
        const greetingMessage = `<color="ff0">${quest.questgiver.name}</color>: ${quest.questgiver.greeting}`;
        this.messagingService.sendLongMessage(playerId, greetingMessage);
        console.log(`[Hoopla RPG] ${playerName} interacted with ${quest.questgiver.name}: ${quest.questgiver.greeting}`);
        return;
      }
      
      // Handle existing quest based on interaction step
      
      switch (currentQuest.interactionStep) {
        case 1:
          // Step 2: Show quest explanation
          currentQuest.interactionStep = 2;
          await this.playerService.setPlayerData({ id: playerId }, questPlayer);
          
          const questExplanationMessage = `<color="ff0">${quest.questgiver.name}</color>: ${quest.questgiver.questExplanation}`;
          this.messagingService.sendLongMessage(playerId, questExplanationMessage);
          console.log(`[Hoopla RPG] ${playerName} interacted with ${quest.questgiver.name}: ${quest.questgiver.questExplanation}`);
          break;
          
        case 2:
          // Step 2: Check if quest can be completed
          const canComplete = await this.checkQuestCompletion(playerId, quest);
          const canCompleteWithSpecialHandling = await this.handleOutOfOrderQuestItems(playerId, quest);
          if (canComplete || canCompleteWithSpecialHandling) {
            // Complete the quest
            await this.completeQuest(playerId, quest);
            
            // Update the quest status to completed and set interaction step to 3
            currentQuest.status = 'completed';
            currentQuest.interactionStep = 3;
            await this.playerService.setPlayerData({ id: playerId }, questPlayer);
            
            const completionMessage = `<color="ff0">${quest.questgiver.name}</color>: ${quest.questgiver.completionMessage}`;
            this.messagingService.sendLongMessage(playerId, completionMessage);
            console.log(`[Hoopla RPG] ${playerName} interacted with ${quest.questgiver.name}: ${quest.questgiver.completionMessage}`);
            
            // Show hint about next quest if available
            const nextQuestId = this.getNextQuestInChain(quest.id);
            if (nextQuestId) {
              const nextQuest = this.getQuestById(nextQuestId);
              if (nextQuest && !questPlayer.quests?.[nextQuestId]) {
                // Always start the next quest normally - don't skip steps or auto-complete
                const nextQuestHint = `<color="ff0">New quest available!</color> Talk to ${quest.questgiver.name} again to start the next quest in the chain.`;
                this.omegga.whisper(playerId, nextQuestHint);
              }
            }
          } else {
            // Show progress reminder with current progress
            const progressMessage = await this.getQuestProgressMessage(playerId, quest);
            this.messagingService.sendLongMessage(playerId, progressMessage);
            console.log(`[Hoopla RPG] ${playerName} interacted with ${quest.questgiver.name}: ${progressMessage}`);
          }
          break;
          
        case 3:
          // Step 3: Quest completed - check for next quest in chain
          console.log(`[DEBUG] Step 3: Quest completed, checking for next quest in chain for quest: ${quest.id}`);
          const nextQuestId = this.getNextQuestInChain(quest.id);
          console.log(`[DEBUG] Next quest ID found: ${nextQuestId}`);
          
          // Check if this is the final quest in the chain (no next quest)
          if (!nextQuestId) {
            // This is the final quest - show completion message
            console.log(`[DEBUG] Final quest in chain, showing completion message`);
            const completionMessage = `<color="ff0">${quest.questgiver.name}</color>: ${quest.questgiver.completionMessage}`;
            this.messagingService.sendLongMessage(playerId, completionMessage);
            console.log(`[Hoopla RPG] ${playerName} interacted with ${quest.questgiver.name}: ${quest.questgiver.completionMessage}`);
          } else {
            // There are more quests in the chain
            const nextQuest = this.getQuestById(nextQuestId);
            if (nextQuest && !questPlayer.quests?.[nextQuestId]) {
              // Show hint about next quest and advance to step 4
              currentQuest.interactionStep = 4;
              await this.playerService.setPlayerData({ id: playerId }, questPlayer);
              
              const nextQuestHint = `<color="ff0">New quest available!</color> Talk to ${quest.questgiver.name} again to start the next quest in the chain.`;
              this.omegga.whisper(playerId, nextQuestHint);
            } else if (nextQuest && questPlayer.quests?.[nextQuestId]) {
              // Next quest already exists, show its status
              const nextQuestStatus = questPlayer.quests[nextQuestId];
              if (nextQuestStatus.status === 'completed') {
                // Use the final quest's completion message for proper closure
                const finalQuest = this.getQuestById(nextQuestId);
                const allCompleteMessage = `<color="ff0">${quest.questgiver.name}</color>: ${finalQuest?.questgiver.completionMessage || 'Thank you for completing all my quests! You\'ve been a great help.'}`;
                this.messagingService.sendLongMessage(playerId, allCompleteMessage);
                console.log(`[Hoopla RPG] ${playerName} interacted with ${quest.questgiver.name}: ${finalQuest?.questgiver.completionMessage || 'Thank you for completing all my quests! You\'ve been a great help.'}`);
              } else {
                const nextQuestMessage = `<color="ff0">${quest.questgiver.name}</color>: You still have my other quest to complete. Check your quest log!`;
                this.messagingService.sendLongMessage(playerId, nextQuestMessage);
                console.log(`[Hoopla RPG] ${playerName} interacted with ${quest.questgiver.name}: You still have my other quest to complete. Check your quest log!`);
              }
            }
          }
          break;
          
        case 4:
          // Step 4: Start the next quest in the chain
          const nextQuestId2 = this.getNextQuestInChain(quest.id);
          if (nextQuestId2) {
            const nextQuest = this.getQuestById(nextQuestId2);
            if (nextQuest && !questPlayer.quests?.[nextQuestId2]) {
              // Start the next quest
              questPlayer.quests[nextQuestId2] = {
                questId: nextQuest.id,
                status: 'in_progress',
                requirements: nextQuest.requirements,
                completedRequirements: [],
                interactionStep: 1
              };
              
              await this.playerService.setPlayerData({ id: playerId }, questPlayer);
              
              const questStartedMessage = `<color="ff0">Quest started: ${nextQuest.name}</color> Talk to ${quest.questgiver.name} again to begin the quest.`;
              this.omegga.whisper(playerId, questStartedMessage);
              return;
            }
          }
          break;
          
        default:
          // Reset to step 1 if something goes wrong (but only if not completed)
          if (currentQuest.status !== 'completed') {
            currentQuest.interactionStep = 1;
            await this.playerService.setPlayerData({ id: playerId }, questPlayer);
            
            const resetMessage = `<color="ff0">${quest.questgiver.name}</color>: ${quest.questgiver.greeting}`;
            this.messagingService.sendLongMessage(playerId, resetMessage);
            console.log(`[Hoopla RPG] ${playerName} interacted with ${quest.questgiver.name}: ${quest.questgiver.greeting}`);
          }
      }
      
    } catch (error) {
      console.error(`[Hoopla RPG] Error handling quest interaction:`, error);
      this.omegga.whisper(playerId, "An error occurred processing the quest interaction.");
    }
  }
}
