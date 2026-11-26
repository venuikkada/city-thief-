// Every story mission in THREE ACTS (v8). Each mission now takes 5 minutes or more and is harder.
//   ACT 1  THE PLAN     - meet the person with the job (they talk, Vikram answers), then PREPARE:
//                          buy gear, photograph CCTV cameras, take out lookouts, raise cash by
//                          pickpocketing, chase a snitch, steal the right car, hire a crew member...
//                          then go to the job.
//   ACT 2  THE JOB      - the mission itself, tougher than before (stronger enemies, sharper guards,
//                          tighter timers).
//   ACT 3  THE GETAWAY  - the police come (and they raid the buildings), lose them, take the loot to
//                          a safehouse (sometimes enemies wait there), and report back.
// A CHECKPOINT is saved when each act starts: fail in act 2 or 3 and you can retry from there.
import * as K from './mkit.js';
import { dist, yawOf, pick } from './util.js';

const PI = Math.PI;

// ---------- Places (on foot; the game moves them to the nearest free spot) ----------
const SPOTS = {
  chai: [6.4, 33, "Raju's chai stall"], garage: [-68.5, -37, "Ravi's garage"], warehouse: [-38, 33, 'the old warehouse'],
  promenade: [0, -233.5, 'the seafront promenade'], cafe: [40, -233.5, 'the seafront cafe'], docks: [150, -233.5, 'the docks'],
  hospital: [112.5, 6.6, 'City Hospital'], plaza: [37.5, -37.5, 'the downtown plaza'], bank: [-37.5, -37.5, 'Central Bank square'],
  bazaarN: [37.5, 104, 'the North Bazaar'], bazaarW: [-187.5, -125, 'the West Bazaar'], bazaarE: [112.5, -101, 'the East Bazaar'],
  parkW: [-112.5, 30, 'Lotus Park'], parkE: [187.5, 30, 'Coconut Park'], mela: [-37.5, 176, 'the mela ground'],
  hideout: [-187.5, 112.5, "Salim's hideout"], press: [187.5, -112.5, 'the old printing press'], busDepot: [-70, 6.5, 'the bus depot'],
  yard: [37.5, 37.5, 'the courtyard behind the chai stall'], hotel: [-37.5, -176, 'the beach hotel'],
};
// The job starts here (where each mission placed Vikram before). [x, z, label]
const SITES = {
  1: [6.6, 19.5], 2: [6.6, 19.5], 3: [-68.5, -30], 4: [-35, 31], 5: [-35, 30], 6: [197, -219], 7: [6.6, 19.5], 8: [6.6, 19.5], 9: [201, -219], 10: [6.6, 19.5],
  11: [-25, -6], 12: [95, -68], 13: [6.6, 26], 14: [-40, -73], 15: [-30, -6], 16: [-140, 6], 17: [-47.7, 6.2], 18: [6.6, 19.5], 19: [60, -144], 20: [-37.5, -2.5],
  21: [-6, -219], 22: [6.6, 19.5], 23: [37.5, -72], 24: [6.6, 19.5], 25: [2, -219], 26: [73, 1.3], 27: [30, 100], 28: [0, -233], 29: [110, -101], 30: [5, 26],
  31: [-104, 25], 32: [-70, -5.6], 33: [197, -219], 34: [70, 6.5], 35: [37.5, 100], 36: [-20, -228], 37: [-6.5, 25], 38: [-112, 86], 39: [70, -219], 40: [37.5, -26],
  41: [-37.5, -50], 42: [-112, 26], 43: [81, -20], 44: [6.4, 11], 45: [-6.5, 25], 46: [-40, 1], 47: [180, 108], 48: [-60, -5.6], 49: [22, -219], 50: [197, -219],
  51: [-145, 58], 52: [6.4, 11], 53: [-150, 5.2], 54: [197, -219], 55: [153, 64], 56: [145, 98], 57: [110, -101], 58: [37.5, 30], 59: [37.5, 104], 60: [187.5, 30],
  61: [6.5, 80], 62: [-37.5, 176], 63: [37.5, 100], 64: [-37.5, -176], 65: [6.4, 11], 66: [0, -236], 67: [-37.5, -2], 68: [-70, -30], 69: [20, -228], 70: [-6.5, 25],
  71: [-37.5, 176], 72: [-150, 8], 73: [-37.5, -2], 74: [-40, 1], 75: [150, -233.5], 76: [0, -229],
};

// ---------- The plan for every mission ----------
// meet: [place, WHO, model, [what they say...], Vikram's answer]
// prep: what to do before the job (one or more)   site: name of the job place
// heat: police stars after the job (0 = none)     stash: safehouses (the first one far enough away)
// end : [WHO, model, last line]                    twist: 'ambush' (men wait at the stash) | 'gangcars'
// loot: what Vikram carries to the stash
const gear = (item, price, give = 'none') => ({ t: 'gear', item, price, give });
const ACTS = {
  // ===== Chapter 1: STREET ESCAPE =====
  1: { meet: ['chai', 'RAVI', 'ravi', ['Sona Jewellers keeps its gold in the back yard tonight.', 'Three bags. Two sleepy watchmen. Do not wake them up.'], 'Easy money, Ravi. Leave it to me.'],
    prep: [{ t: 'intel', n: 3, what: 'jewel bags' }], site: 'the main road', heat: 0, stash: ['hideout', 'press'], loot: 'the jewel bags',
    end: ['SALIM', 'm_jacket', 'The jewels are safe with me. Lie low, and tomorrow get some wheels.'] },
  2: { meet: ['garage', 'RAVI', 'ravi', ['For our kind of work you need wheels, Vikram.', 'Buy a hotwire kit at the market first. Then any car is yours.'], 'One car, coming up.'],
    prep: [gear('a hotwire kit', 200)], site: 'the chai stall street', heat: 1, stash: ['chai', 'warehouse'], loot: 'the spare keys',
    end: ['RAJU', 'm_kurta', 'Ravi called. He is hiding at the old warehouse. Go carefully.'] },
  3: { meet: ['busDepot', 'SUNNY', 'm_red', ['Ravi is hiding at the old warehouse.', 'But Kaali\'s lookouts watch the lanes. Clear them first.'], 'I will be quiet like a cat.'],
    prep: [{ t: 'lookouts', n: 2 }], site: 'the lanes north of downtown', heat: 0, stash: ['chai'], loot: 'nothing',
    end: ['RAJU', 'm_kurta', 'Here, Ravi\'s supply bag. Hurry back, I saw police jeeps near the warehouse!'] },
  4: { meet: ['hideout', 'SALIM', 'm_jacket', ['Police jeeps are all around the warehouse.', 'You will need armour for this fight. Buy a vest.'], 'Armour it is.'],
    prep: [gear('a bulletproof vest', 400, 'armour')], site: 'the old warehouse', heat: 2, stash: ['garage', 'hideout'], loot: 'Ravi\'s cash box',
    end: ['RAVI', 'ravi', 'We made it, bhai. But they will come back with everything they have.'] },
  5: { meet: ['promenade', 'SUNNY', 'm_red', ['Rana\'s men put roadblocks everywhere.', 'Photograph their cameras so we know the safe roads.'], 'Smile for the camera, Rana.'],
    prep: [{ t: 'scout', n: 3 }], site: 'the old warehouse', heat: 0, stash: ['parkE', 'docks'], loot: 'the getaway car', twist: 'gangcars',
    end: ['SUNNY', 'm_red', 'You lost three stars? Bhai, you drive like me. Come race on Marine Drive!'] },
  6: { meet: ['promenade', 'SUNNY', 'm_red', ['Tonight\'s race pays big money.', 'Tune my coupe at Ravi\'s garage first. Twenty seconds on the lift.'], 'Let\'s make it fly.'],
    prep: [{ t: 'tune', at: 'garage', sec: 18, label: 'TUNING THE ENGINE' }], site: 'the race start on Marine Drive', heat: 2, stash: ['chai', 'garage'], loot: 'the prize money',
    end: ['SUNNY', 'm_red', 'Bad news: it was Pappu who tipped off the police. He hangs around the bazaar.'] },
  7: { meet: ['chai', 'RAJU', 'm_kurta', ['Pappu owes me money too.', 'His friend Chintu knows where he hides. Make Chintu talk.'], 'Chintu will talk.'],
    prep: [{ t: 'snitch', who: 'CHINTU', rig: 'm_hoodie', line: 'Okay okay! Pappu sits in the bazaar every evening!' }], site: 'the chai stall street', heat: 1, stash: ['hideout'], loot: 'Pappu\'s phone', twist: 'ambush',
    end: ['RAVI', 'ravi', 'Rana? The police boss himself? Then we need money, fast.'] },
  8: { meet: ['garage', 'RAVI', 'ravi', ['Kaali\'s gang stole my cash and hid it in eight bags.', 'Get a vest first. Kaali\'s boys shoot first and think never.'], 'Every single rupee comes back.'],
    prep: [gear('a bulletproof vest', 400, 'armour')], site: 'the chai stall street', heat: 2, stash: ['garage'], loot: 'the eight cash bags', twist: 'gangcars',
    end: ['RAVI', 'ravi', 'All of it! Kaali will be very, very angry.'] },
  9: { meet: ['garage', 'RAVI', 'ravi', ['Kaali left a gift in my van. It is ticking.', 'Get wire cutters from the market. We will need them.'], 'Keep calm, Ravi.'],
    prep: [gear('wire cutters', 300)], site: 'Ravi\'s van on Marine Drive', heat: 2, stash: ['chai'], loot: 'the bomb timer',
    end: ['RAJU', 'm_kurta', 'Vikram! Kaali\'s men took Sonu to the bazaar!'] },
  10: { meet: ['hideout', 'SALIM', 'm_jacket', ['Kaali has twenty men in the bazaar.', 'I am coming with you. Two guns are better than one.'], 'Chalo, Salim bhai.'],
    prep: [{ t: 'crew', who: 'SALIM', rig: 'm_jacket' }], site: 'the chai stall street', heat: 3, stash: ['garage'], loot: 'Sonu',
    end: ['RAVI', 'ravi', 'Kaali is finished and Sonu is safe. Navapur is ours... almost.'] },
  // ===== Chapter 2: CITY OF GOLD =====
  11: { meet: ['plaza', 'RAVI', 'ravi', ['Mehta runs the Gold Exchange.', 'The parking boy knows his car. Pay him for the number.'], 'Money talks.'],
    prep: [{ t: 'bribe', who: 'PARKING BOY', rig: 'm_delivery', price: 300, line: 'White sedan. He leaves at noon. You never met me!' }], site: 'Mehta\'s office street', heat: 0, stash: ['garage'], loot: 'the photos', twist: 'gangcars',
    end: ['RAVI', 'ravi', 'A secret meeting with Rana? The gold moves in three days.'] },
  12: { meet: ['chai', 'RAVI', 'ravi', ['For the gold job we need a police SUV.', 'Photograph the parking cameras first, so we know where to hide.'], 'Cameras first, then the car.'],
    prep: [{ t: 'scout', n: 3 }], site: 'the police parking', heat: 2, stash: ['warehouse'], loot: 'nothing',
    end: ['RAVI', 'ravi', 'Perfect SUV. But Kaali\'s last men want revenge at the chai stall.'] },
  13: { meet: ['chai', 'RAJU', 'm_kurta', ['Kaali\'s leftover gang wants to burn my stall.', 'They come with guns. Buy armour, Vikram.'], 'Nobody touches your stall, Raju bhai.'],
    prep: [gear('a bulletproof vest', 500, 'armour')], site: 'the chai stall', heat: 2, stash: ['garage'], loot: 'the stall cash box',
    end: ['RAVI', 'ravi', 'The stall is safe. Sunny wants you for something fun...'] },
  14: { meet: ['promenade', 'SUNNY', 'm_red', ['Real drivers drift, bhai.', 'First, drift tyres. Ravi\'s garage, twenty seconds on the lift.'], 'Smoke and style.'],
    prep: [{ t: 'tune', at: 'garage', sec: 18, label: 'FITTING DRIFT TYRES' }], site: 'the downtown loop', heat: 1, stash: ['promenade', 'chai'], loot: 'nothing',
    end: ['SUNNY', 'm_red', 'Smoke everywhere! The heist crew needs a getaway driver like you.'] },
  15: { meet: ['garage', 'RAVI', 'ravi', ['Today Sonu and I hit the Gold Exchange counter.', 'You drive. Steal us something fast: a sports car.'], 'Fast and quiet.'],
    prep: [{ t: 'ride', type: 'sports', color: 0xd62828, name: 'the red sports car' }], site: 'the Gold Exchange', heat: 0, stash: ['hideout'], loot: 'the counter cash', twist: 'ambush',
    end: ['SALIM', 'm_jacket', 'Gold counter money, very nice. But Rana knows your face now.'] },
  16: { meet: ['promenade', 'SUNNY', 'm_red', ['A package must cross town in two minutes.', 'Pick it up from my man at the East Bazaar.'], 'Two minutes. Easy.'],
    prep: [gear('Sunny\'s package', 0)], site: 'the west park road', heat: 2, stash: ['parkE', 'promenade'], loot: 'Sunny\'s cut',
    end: ['SUNNY', 'm_red', 'On time! Rana\'s men guard the old warehouse now. Be a ghost.'] },
  17: { meet: ['hideout', 'SALIM', 'm_jacket', ['Rana\'s men guard the vault plans in the warehouse.', 'Buy dark clothes, then photograph their guard posts.'], 'In and out like a ghost.'],
    prep: [gear('dark clothes', 300), { t: 'scout', n: 2 }], site: 'the warehouse lanes', heat: 2, stash: ['garage'], loot: 'the vault plans',
    end: ['RAVI', 'ravi', 'The vault plans! But Rana is planting bombs to frame you.'] },
  18: { meet: ['chai', 'RAVI', 'ravi', ['Rana planted bombs and told the news it was you.', 'A bomb expert owes me. Get his toolkit from the bazaar.'], 'No time to waste.'],
    prep: [gear('the bomb toolkit', 0)], site: 'the chai stall street', heat: 2, stash: ['warehouse'], loot: 'the bomb parts',
    end: ['RAVI', 'ravi', 'Tonight: the Marine Palace vault. The biggest job of our lives.'] },
  19: { meet: ['warehouse', 'RAVI', 'ravi', ['The Marine Palace vault. Gold, gold, gold.', 'Buy the heavy drill bit, and clear the lookouts at the palace.'], 'Let\'s get rich.'],
    prep: [gear('a heavy drill bit', 600), { t: 'lookouts', n: 2 }], site: 'the Marine Palace', heat: 0, stash: ['docks', 'press'], loot: 'the gold', twist: 'ambush',
    end: ['RAVI', 'ravi', 'We are rich, Vikram! But Rana wants his gold back.'] },
  20: { meet: ['hideout', 'SALIM', 'm_jacket', ['Rana\'s army waits at the downtown plaza.', 'Take Imran with you. He never misses.'], 'Today it ends.'],
    prep: [{ t: 'crew', who: 'IMRAN', rig: 'm_denim', at: 'parkW' }], site: 'the downtown plaza', heat: 3, stash: ['promenade', 'garage'], loot: 'Rana\'s badge',
    end: ['RAVI', 'ravi', 'Rana is finished. But Navapur never sleeps, bhai.'] },
  // ===== Chapter 3: NAVAPUR NIGHTS =====
  21: { meet: ['promenade', 'SUNNY', 'm_red', ['Tonight we go LIVE. One million viewers!', 'Charge the phone first. Buy a power bank.'], 'Lights, camera, chori.'],
    prep: [gear('a power bank', 150)], site: 'Marine Drive', heat: 0, stash: ['chai'], loot: 'the phone',
    end: ['SUNNY', 'm_red', 'A million viewers! Rana is showing off his golden treasure for Holi.'] },
  22: { meet: ['chai', 'RAJU', 'm_kurta', ['Holi! Everyone in colour, nobody can see faces.', 'Buy colour packets at the bazaar. You will need them.'], 'Bura na mano, Holi hai!'],
    prep: [gear('gulal colour packets', 200)], site: 'the chai stall street', heat: 0, stash: ['garage'], loot: 'the Golden Pichkari',
    end: ['RAVI', 'ravi', 'The Golden Pichkari! And now time itself is acting strange...'] },
  23: { meet: ['plaza', 'RAVI', 'ravi', ['Something is wrong with time, Vikram.', 'The old watchmaker knows. Pay him a visit.'], 'Time is money.'],
    prep: [{ t: 'bribe', who: 'WATCHMAKER', rig: 'm_kurta', price: 200, line: 'Every minute the night starts again. Remember everything you see!' }], site: 'the vault street', heat: 2, stash: ['warehouse'], loot: 'the vault code',
    end: ['RAVI', 'ravi', 'Rana cut the power of the whole city. Be ready.'] },
  24: { meet: ['chai', 'RAJU', 'm_kurta', ['No power anywhere. Rana\'s hunters carry torches.', 'Buy a torch, beta. And stay in the shadows.'], 'Darkness is my friend.'],
    prep: [gear('a torch', 150)], site: 'the chai stall street', heat: 2, stash: ['garage'], loot: 'the fuse keys',
    end: ['RAVI', 'ravi', 'Lights are back! But a monsoon is coming. A big one.'] },
  25: { meet: ['promenade', 'SUNNY', 'm_red', ['The flood is rising fast!', 'Get a life jacket from the market first.'], 'Hold on, Ravi.'],
    prep: [gear('a life jacket', 200)], site: 'the seafront', heat: 0, stash: ['hospital'], loot: 'Ravi',
    end: ['DOCTOR', 'm_office', 'Ravi will be fine. But police checkpoints are on every road now.'] },
  26: { meet: ['chai', 'RAJU', 'm_kurta', ['Police checkpoints on every road.', 'My cousin\'s baraat passes tonight. Buy a sherwani from the tailor!'], 'Dulhe ka dost, ready.'],
    prep: [gear('a sherwani', 400)], site: 'the wedding procession', heat: 1, stash: ['hideout'], loot: 'the shagun envelope',
    end: ['SALIM', 'm_jacket', 'You danced past the police? Legend. Something big is coming.'] },
  // ===== Chapter 4: STREET SMART =====
  27: { meet: ['chai', 'RAJU', 'm_kurta', ['Ravi did not come for chai today. He never misses chai.', 'His phone is off. Search the garage yard for clues.'], 'I will find him.'],
    prep: [{ t: 'intel', n: 2, what: 'clues', near: 'garage' }], site: 'the North Bazaar', heat: 0, stash: ['hideout'], loot: 'the clues', twist: 'ambush',
    end: ['SALIM', 'm_jacket', 'Chhota Babu has Ravi? Then we play Babu\'s game.'] },
  28: { meet: ['hideout', 'SALIM', 'm_jacket', ['Babu wants to test your fingers.', 'Practise first: lift one wallet in the bazaar.'], 'Light fingers, heavy pockets.'],
    prep: [{ t: 'cash', n: 1 }], site: 'the seafront', heat: 0, stash: ['bazaarE'], loot: 'the wallets',
    end: ['CHHOTA BABU', 'm_tee', 'Hmph. You won the bet. Ravi is alive... for now.'] },
  29: { meet: ['bazaarE', 'DADI', 'f_grey', ['Beta, these market thieves are everywhere.', 'Will you buy my medicine first? My knees, haaye.'], 'Of course, Dadi.'],
    prep: [gear('Dadi\'s medicine', 100, 'health')], site: 'the East Bazaar', heat: 0, stash: ['chai'], loot: 'the purse',
    end: ['RAJU', 'm_kurta', 'You need a crew to fight Babu, Vikram.'] },
  30: { meet: ['chai', 'RAJU', 'm_kurta', ['Babu\'s goons will burn my stall tonight.', 'Buy armour. And hire strong people from the street.'], 'Let them come.'],
    prep: [gear('a bulletproof vest', 500, 'armour')], site: 'the chai stall', heat: 2, stash: ['hideout'], loot: 'nothing',
    end: ['SALIM', 'm_jacket', 'Babu\'s men talk too much over chai. Use that.'] },
  31: { meet: ['chai', 'RAJU', 'm_kurta', ['Babu\'s men drink chai at the park every afternoon.', 'Wear my chai boy uniform. First, buy a new kettle!'], 'One cutting chai, coming up.'],
    prep: [gear('a chai kettle', 120)], site: 'Lotus Park', heat: 1, stash: ['chai'], loot: 'the secrets',
    end: ['RAJU', 'm_kurta', 'A taxi job is coming your way... with a dangerous passenger.'] },
  32: { meet: ['busDepot', 'UNION BOSS', 'm_kurta', ['You want to drive a kaali peeli? Ha!', 'The meter is broken. Get it fixed at Ravi\'s garage.'], 'Meter down, boss.'],
    prep: [{ t: 'tune', at: 'garage', sec: 15, label: 'FIXING THE TAXI METER' }], site: 'the taxi stand', heat: 0, stash: ['hideout'], loot: 'the fares', twist: 'gangcars',
    end: ['SALIM', 'm_jacket', 'That passenger knew where Babu sleeps!'] },
  33: { meet: ['promenade', 'SUNNY', 'm_red', ['Auto-rickshaw race! Three autos, no brakes.', 'Learn the route: photograph the three tricky corners.'], 'Teen pahiye, full speed.'],
    prep: [{ t: 'scout', n: 3, what: 'corners' }], site: 'the race start', heat: 1, stash: ['chai'], loot: 'the prize',
    end: ['SUNNY', 'm_red', 'A tiffin man is carrying more than lunch...'] },
  34: { meet: ['chai', 'RAJU', 'm_kurta', ['The tiffin man brings Babu his lunch... and his cash.', 'Buy a camera roll at the bazaar, you will need photos.'], 'Click click.'],
    prep: [gear('a camera roll', 100)], site: 'the tiffin route', heat: 1, stash: ['hideout'], loot: 'the photos',
    end: ['SALIM', 'm_jacket', 'Babu\'s men are coming to burn the bazaar!'] },
  35: { meet: ['bazaarN', 'SHOPKEEPER', 'm_kurta', ['Babu\'s men will burn our bazaar tonight!', 'My fire extinguisher is in the back yard. Bring it!'], 'Nobody burns this bazaar.'],
    prep: [{ t: 'intel', n: 1, what: 'fire extinguisher', near: 'bazaarN' }], site: 'the North Bazaar', heat: 2, stash: ['hideout'], loot: 'the petrol cans',
    end: ['SALIM', 'm_jacket', 'Babu is hiding on the seafront. Time to end him.'] },
  36: { meet: ['hideout', 'SALIM', 'm_jacket', ['Babu has his last men with him.', 'Take Imran. He shoots straight.'], 'Babu\'s day is over.'],
    prep: [{ t: 'crew', who: 'IMRAN', rig: 'm_denim', at: 'parkW' }], site: 'the seafront', heat: 3, stash: ['garage'], loot: 'Babu\'s keys',
    end: ['RAVI', 'ravi', 'You came for me, bhai! Now a politician is printing fake money...'] },
  // ===== Chapter 5: UNDERCOVER =====
  37: { meet: ['garage', 'RAVI', 'ravi', ['Neta Bhanwar Lal prints fake money in the old godown.', 'Buy a delivery uniform. Walk in like you belong.'], 'Parcel for Neta ji!'],
    prep: [gear('a delivery uniform', 300)], site: 'the old godown', heat: 1, stash: ['garage'], loot: 'the tracker receiver',
    end: ['RAVI', 'ravi', 'The tracker works! Now you need a police uniform.'] },
  38: { meet: ['chai', 'RAJU', 'm_kurta', ['Police uniforms dry on the lines behind the station.', 'Distract them: buy fireworks at the bazaar.'], 'Diwali came early.'],
    prep: [gear('a box of fireworks', 200)], site: 'the police station', heat: 2, stash: ['hideout'], loot: 'Neta\'s file',
    end: ['SALIM', 'm_jacket', 'Neta meets someone secret at the seafront cafe.'] },
  39: { meet: ['promenade', 'SUNNY', 'm_red', ['Neta\'s men meet a foreign buyer at the cafe.', 'Buy a zoom lens. Stay far away and click.'], 'Say cheese, Neta ji.'],
    prep: [gear('a zoom lens', 300)], site: 'the seafront cafe', heat: 1, stash: ['garage'], loot: 'the photos',
    end: ['RAVI', 'ravi', 'Who is Neta\'s secret assistant? Find out.'] },
  40: { meet: ['garage', 'RAVI', 'ravi', ['We must copy the assistant\'s phone.', 'Buy a phone cloner at the electronics stall.'], 'Copy, paste, gone.'],
    prep: [gear('a phone cloner', 400)], site: 'the downtown plaza', heat: 0, stash: ['hideout'], loot: 'the phone copy', twist: 'ambush',
    end: ['SALIM', 'm_jacket', 'The accountant wants to testify... if he lives.'] },
  41: { meet: ['hideout', 'SALIM', 'm_jacket', ['Neta\'s shooters will be on the roofs.', 'Wear armour. Bullets love witnesses.'], 'He will reach the court.'],
    prep: [gear('a bulletproof vest', 600, 'armour')], site: 'Central Bank', heat: 2, stash: ['garage'], loot: 'the court papers',
    end: ['RAVI', 'ravi', 'Desai testified! Neta holds an election rally tomorrow.'] },
  42: { meet: ['chai', 'RAJU', 'm_kurta', ['Neta\'s rally is tomorrow at the park.', 'Buy a party flag so you blend in with the crowd.'], 'Neta ji zindabad... not.'],
    prep: [gear('a party flag', 50)], site: 'the park rally', heat: 1, stash: ['garage'], loot: 'the recorder',
    end: ['RAVI', 'ravi', 'The recorder caught everything. Neta\'s driver is next.'] },
  43: { meet: ['garage', 'RAVI', 'ravi', ['Neta\'s driver parks behind the hotel.', 'Scout his street: photograph the two cameras.'], 'The driver takes a holiday today.'],
    prep: [{ t: 'scout', n: 2 }], site: 'the hotel lane', heat: 2, stash: ['hideout'], loot: 'Neta\'s car keys',
    end: ['SALIM', 'm_jacket', 'The assistant ran away with the laptop!'] },
  44: { meet: ['hideout', 'SALIM', 'm_jacket', ['The assistant\'s laptop is full of secrets.', 'Steal a heavy black SUV. Perfect for ramming.'], 'Ram, grab, run.'],
    prep: [{ t: 'ride', type: 'suv', color: 0x1d1e22, name: 'the black SUV' }], site: 'the chai stall street', heat: 0, stash: ['garage'], loot: 'the laptop', twist: 'gangcars',
    end: ['RAVI', 'ravi', 'Quiet or loud? The party office is next.'] },
  45: { meet: ['garage', 'RAVI', 'ravi', ['The master plates are in Neta\'s party office.', 'If you go quiet, you need a cleaner\'s mop. Buy one.'], 'Quiet... or loud.'],
    prep: [gear('a cleaner\'s mop', 80)], site: 'the party office', heat: 2, stash: ['hideout'], loot: 'the master plates',
    end: ['SALIM', 'm_jacket', 'Neta is running. End it.'] },
  46: { meet: ['hideout', 'SALIM', 'm_jacket', ['Neta flees the city today in a convoy.', 'Take Imran. He drives like the wind.'], 'No escape, Neta ji.'],
    prep: [{ t: 'crew', who: 'IMRAN', rig: 'm_denim', at: 'parkW' }], site: 'the convoy route', heat: 3, stash: ['garage'], loot: 'Neta\'s briefcase',
    end: ['RAVI', 'ravi', 'Neta is in jail. Collector Kapoor wants the best car thief in Navapur...'] },
  // ===== Chapter 6: FAST AND DESI =====
  47: { meet: ['garage', 'RAVI', 'ravi', ['Kapoor pays big for stolen cars.', 'Buy fake number plates first.'], 'Three cars, three plates.'],
    prep: [gear('fake number plates', 400)], site: 'Kapoor\'s garage', heat: 2, stash: ['garage'], loot: 'Kapoor\'s cash',
    end: ['RAVI', 'ravi', 'Kapoor\'s cash travels by city bus. Interesting...'] },
  48: { meet: ['busDepot', 'CONDUCTOR', 'm_sweater', ['The real driver is... sick today. Ha ha!', 'Take his uniform from the depot office.'], 'Next stop, Kapoor\'s money.'],
    prep: [gear('a bus driver uniform', 0)], site: 'the bus depot', heat: 0, stash: ['garage'], loot: 'the money box', twist: 'gangcars',
    end: ['RAVI', 'ravi', 'A crash on the seafront! People need a hospital now!'] },
  49: { meet: ['promenade', 'SUNNY', 'm_red', ['A big crash near the beach!', 'The ambulance driver ran away. Get the keys from the doctor.'], 'Every second counts.'],
    prep: [{ t: 'bribe', who: 'DOCTOR', rig: 'm_office', price: 0, line: 'Keys! Go, go! Every second counts!' }], site: 'the seafront crash', heat: 0, stash: ['hospital'], loot: 'the patients',
    end: ['DOCTOR', 'm_office', 'You saved three lives today. Kapoor wants a drag race now.'] },
  50: { meet: ['promenade', 'SUNNY', 'm_red', ['Kapoor\'s drag race. One straight line.', 'Fill nitro at Ravi\'s garage first.'], 'Nitro full, fear empty.'],
    prep: [{ t: 'tune', at: 'garage', sec: 18, label: 'FILLING NITRO' }], site: 'the drag strip', heat: 2, stash: ['chai'], loot: 'the pink slip',
    end: ['SUNNY', 'm_red', 'Kapoor\'s stolen parts travel in a goods truck.'] },
  51: { meet: ['garage', 'RAVI', 'ravi', ['A goods truck carries Kapoor\'s stolen parts.', 'Steal a strong SUV to box it in.'], 'Box it, stop it, take it.'],
    prep: [{ t: 'ride', type: 'suv', color: 0x6b6e73, name: 'the grey SUV' }], site: 'the truck route', heat: 2, stash: ['garage', 'hideout'], loot: 'the parts',
    end: ['RAVI', 'ravi', 'Kapoor will jam the whole city to catch you now.'] },
  52: { meet: ['chai', 'RAJU', 'm_kurta', ['Kapoor paid the traffic police. Jams everywhere!', 'Learn the alleys: collect the three shortcut maps.'], 'Shortcuts are my speciality.'],
    prep: [{ t: 'intel', n: 3, what: 'shortcut maps', near: 'chai' }], site: 'the chai stall street', heat: 0, stash: ['hideout'], loot: 'the maps',
    end: ['SALIM', 'm_jacket', 'A demolition derby in the streets is next!'] },
  53: { meet: ['garage', 'RAVI', 'ravi', ['Kapoor\'s gang cars will hunt you.', 'Weld a steel bumper on your car first.'], 'Let them come.'],
    prep: [{ t: 'tune', at: 'garage', sec: 18, label: 'WELDING A STEEL BUMPER' }], site: 'the west road', heat: 2, stash: ['garage'], loot: 'nothing',
    end: ['RAVI', 'ravi', 'Kapoor races at night with the lights off.'] },
  54: { meet: ['promenade', 'SUNNY', 'm_red', ['No street lights tonight. Only your headlights.', 'Buy bright headlights from the market.'], 'Lights off, speed on.'],
    prep: [gear('bright headlights', 300)], site: 'the race start', heat: 1, stash: ['chai'], loot: 'the prize',
    end: ['SUNNY', 'm_red', 'Kapoor is attacking the relief trucks!'] },
  55: { meet: ['hospital', 'CAMP LADY', 'f_salwar', ['Three trucks of food for the flood camp.', 'Kapoor\'s men will hijack them. Take out his lookouts first!'], 'The food will reach the camp.'],
    prep: [{ t: 'lookouts', n: 2 }], site: 'the convoy start', heat: 0, stash: ['hospital'], loot: 'the camp list',
    end: ['CAMP LADY', 'f_salwar', 'Food for a thousand families. Thank you, beta.'] },
  56: { meet: ['hideout', 'SALIM', 'm_jacket', ['Kapoor comes in an armoured SUV.', 'Buy armour-piercing bullets.'], 'Armour or not, he goes down.'],
    prep: [gear('armour-piercing bullets', 800, 'ammo')], site: 'Kapoor\'s street', heat: 3, stash: ['garage'], loot: 'Kapoor\'s keys',
    end: ['RAVI', 'ravi', 'Kapoor is done. Festival season... and Rana is back.'] },
  // ===== Chapter 7: FESTIVAL CITY =====
  57: { meet: ['chai', 'RAJU', 'm_kurta', ['Happy Diwali! But Rana hid bombs in the cracker stalls.', 'Get the bomb toolkit from the bomb expert.'], 'Only good fireworks tonight.'],
    prep: [gear('the bomb toolkit', 0)], site: 'the East Bazaar', heat: 1, stash: ['chai'], loot: 'the bomb parts',
    end: ['RAJU', 'm_kurta', 'Spy drones are watching the rooftops now!'] },
  58: { meet: ['yard', 'KITE BOY', 'm_tee', ['Rana\'s drones hide among the kites!', 'Buy a gun scope, bhaiya. They fly high.'], 'Kai po che!'],
    prep: [gear('a gun scope', 300, 'ammo')], site: 'the rooftops', heat: 2, stash: ['hideout'], loot: 'a drone camera',
    end: ['SALIM', 'm_jacket', 'Garba night: Rana\'s money man will be dancing.'] },
  59: { meet: ['bazaarN', 'MEENA', 'f_purple', ['Rana\'s money man loves garba.', 'Buy dandiya sticks, or they will not let you in.'], 'Let\'s dance.'],
    prep: [gear('dandiya sticks', 60)], site: 'the garba circle', heat: 1, stash: ['garage'], loot: 'the money man\'s wallet',
    end: ['RAVI', 'ravi', 'A gully cricket final... with a golden trophy.'] },
  60: { meet: ['parkE', 'CAPTAIN', 'm_tee', ['Our team needs a batsman for the final.', 'Buy a bat from the sports stall!'], 'Sixer pakka.'],
    prep: [gear('a cricket bat', 150)], site: 'the park', heat: 0, stash: ['chai'], loot: 'the golden trophy', twist: 'ambush',
    end: ['RAJU', 'm_kurta', 'Ganpati visarjan tomorrow. Protect the idol!'] },
  61: { meet: ['chai', 'RAJU', 'm_kurta', ['Rana\'s men will attack the visarjan.', 'Buy armour. Bappa will understand.'], 'Ganpati Bappa Morya!'],
    prep: [gear('a bulletproof vest', 600, 'armour')], site: 'the procession start', heat: 2, stash: ['promenade'], loot: 'nothing',
    end: ['RAVI', 'ravi', 'The mela has a shooting gallery with a strange prize.'] },
  62: { meet: ['mela', 'SUNNY', 'm_red', ['The gallery prize is the key to Rana\'s locker.', 'Warm up: buy extra bullets.'], 'Bullseye every time.'],
    prep: [gear('extra bullets', 200, 'ammo')], site: 'the mela', heat: 2, stash: ['garage'], loot: 'the locker papers',
    end: ['RAVI', 'ravi', 'Holi again... and Rana wants a rematch.'] },
  63: { meet: ['chai', 'RAJU', 'm_kurta', ['Rana\'s men attack during Holi!', 'Buy colour bombs at the bazaar.'], 'Rang barse!'],
    prep: [gear('colour bombs', 200)], site: 'the bazaar', heat: 2, stash: ['hideout'], loot: 'nothing',
    end: ['SALIM', 'm_jacket', 'A rich wedding... and a jewellery locker.'] },
  64: { meet: ['hideout', 'SALIM', 'm_jacket', ['A rich wedding at the beach hotel.', 'Buy a waiter\'s uniform from the tailor.'], 'Starters, sir?'],
    prep: [gear('a waiter\'s uniform', 300)], site: 'the beach hotel', heat: 2, stash: ['garage'], loot: 'the jewellery',
    end: ['RAVI', 'ravi', 'Lanterns across the city before the fireworks!'] },
  65: { meet: ['chai', 'RAJU', 'm_kurta', ['Five lanterns: the signal for our friends.', 'Buy lantern oil first!'], 'Let there be light.'],
    prep: [gear('lantern oil', 100)], site: 'the chai stall street', heat: 1, stash: ['promenade'], loot: 'nothing',
    end: ['SUNNY', 'm_red', 'The fireworks show. Rana\'s last stand.'] },
  66: { meet: ['hideout', 'SALIM', 'm_jacket', ['Rana\'s last stand at the beach fireworks.', 'Take Imran with you.'], 'Last show, Rana.'],
    prep: [{ t: 'crew', who: 'IMRAN', rig: 'm_denim', at: 'parkW' }], site: 'the beach show', heat: 3, stash: ['garage'], loot: 'Rana\'s gun',
    end: ['RAVI', 'ravi', 'Rana is gone for good. Now the biggest job of our lives: the Central Bank.'] },
  // ===== Chapter 8: KING OF NAVAPUR =====
  67: { meet: ['garage', 'RAVI', 'ravi', ['Navapur Central Bank. The final job.', 'A guard sells the building map. Pay him.'], 'Every plan starts with a map.'],
    prep: [{ t: 'bribe', who: 'GUARD', rig: 'police', price: 500, line: 'The map is yours. You never met me!' }], site: 'Central Bank', heat: 1, stash: ['hideout'], loot: 'the photos',
    end: ['SALIM', 'm_jacket', 'Every heist needs wheels.'] },
  68: { meet: ['hideout', 'SALIM', 'm_jacket', ['We need a fast car and a van for the crew.', 'Buy fake number plates first.'], 'Two rides, coming up.'],
    prep: [gear('fake number plates', 400)], site: 'Ravi\'s garage', heat: 2, stash: ['hideout', 'press'], loot: 'nothing',
    end: ['RAVI', 'ravi', 'The bank manager\'s key card is next.'] },
  69: { meet: ['promenade', 'SUNNY', 'm_red', ['The manager drinks coffee on the promenade.', 'Practise first: lift two wallets.'], 'Light fingers.'],
    prep: [{ t: 'cash', n: 2 }], site: 'the promenade cafe', heat: 1, stash: ['garage'], loot: 'the key card',
    end: ['RAVI', 'ravi', 'Tools next: quiet or loud?'] },
  70: { meet: ['garage', 'RAVI', 'ravi', ['The drill is in the construction yard.', 'Take out the lookouts outside first.'], 'One by one.'],
    prep: [{ t: 'lookouts', n: 3 }], site: 'the construction yard', heat: 2, stash: ['hideout'], loot: 'the drill',
    end: ['SALIM', 'm_jacket', 'Time to test your new crew.'] },
  71: { meet: ['hideout', 'SALIM', 'm_jacket', ['Two new crew members want in.', 'Imran waits at Lotus Park. Bring him.'], 'Let\'s see their aim.'],
    prep: [{ t: 'crew', who: 'IMRAN', rig: 'm_denim', at: 'parkW' }], site: 'the mela gallery', heat: 0, stash: ['garage'], loot: 'nothing', twist: 'ambush',
    end: ['RAVI', 'ravi', 'The police must be busy on heist day.'] },
  72: { meet: ['garage', 'RAVI', 'ravi', ['On heist day the police must be far away.', 'Buy the car bombs from Salim\'s contact.'], 'Boom, boom, boom.'],
    prep: [gear('three car bombs', 600)], site: 'the west streets', heat: 0, stash: ['hideout'], loot: 'nothing',
    end: ['SALIM', 'm_jacket', 'Tomorrow... HEIST DAY.'] },
  73: { meet: ['hideout', 'SALIM', 'm_jacket', ['This is it. Heist day.', 'Buy heavy armour. No mistakes today.'], 'For Navapur.'],
    prep: [gear('heavy armour', 1000, 'armour')], site: 'Central Bank', heat: 0, stash: ['garage'], loot: 'the gold', twist: 'ambush',
    end: ['RAVI', 'ravi', 'Five stars are coming. Get the gold to the docks!'] },
  74: { meet: ['garage', 'RAVI', 'ravi', ['Every police car in Navapur is coming.', 'Load the gold into the van. Twenty seconds.'], 'Load it up.'],
    prep: [{ t: 'tune', at: 'garage', sec: 18, label: 'LOADING THE GOLD' }], site: 'the van street', heat: 0, stash: ['docks'], loot: 'the gold van',
    end: ['SUNNY', 'm_red', 'Thanks for the gold, bhai. The speedboat is ready... for me.'] },
  75: { meet: ['docks', 'RAVI', 'ravi', ['Sunny took the gold and the fast boat!', 'Fuel the second boat at the dock pump.'], 'Sunny, you snake.'],
    prep: [{ t: 'tune', at: 'docks', sec: 15, label: 'FUELLING THE BOAT' }], site: 'the jetty', heat: 0, stash: ['docks', 'promenade'], loot: 'the gold',
    end: ['RAVI', 'ravi', 'Sunny worked for the Commissioner all along...'] },
  76: { meet: ['hideout', 'SALIM', 'm_jacket', ['The Commissioner owns every cop in Navapur.', 'Take Imran and the heaviest armour you can buy.'], 'Today Navapur gets a new king.'],
    prep: [{ t: 'crew', who: 'IMRAN', rig: 'm_denim', at: 'parkW' }, gear('heavy armour', 1000, 'armour')], site: 'Marine Drive', heat: 4, stash: ['garage'], loot: 'the Commissioner\'s badge',
    end: ['RAVI', 'ravi', 'King of Navapur! But Sagarpet is waiting...'] },
};

// ---------- Helpers ----------
const title = (who) => who.split(' ').map((w) => w[0] + w.slice(1).toLowerCase()).join(' ');
const near = (g, x, z, r) => { const T = g.dispatch.target; return dist(T.x, T.z, x, z) < r; };
// A walkable spot near (x, z).
function free(g, x, z) {
  const nav = g.nav;
  const id = nav.nearestFree(nav.idx(x, z));
  if (id >= 0) return { x: nav.cx(id), z: nav.cz(id) };
  // Inside something big (a fountain, a building): look further out, ring by ring.
  for (let r = 2; r <= 14; r += 1) {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * PI * 2, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (nav.free(nav.idx(px, pz))) return { x: px, z: pz };
    }
  }
  return { x, z };
}
function spot(g, key) { const s = SPOTS[key] || SPOTS.chai; const p = free(g, s[0], s[1]); return { x: p.x, z: p.z, label: s[2], key }; }
const subsDone = (g) => g.hud.subT <= 0 && !g.hud.subQueue.length;
// Free spots around (cx, cz) between r0 and r1 metres (spread out), for lookouts and cameras.
function ring(g, cx, cz, r0, r1, n, test) {
  const out = [];
  for (let k = 0; k < 80 && out.length < n; k++) {
    const a = Math.random() * PI * 2, r = r0 + Math.random() * (r1 - r0);
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    if (!g.nav.free(g.nav.idx(x, z))) continue;
    if (test && !test(x, z)) continue;
    if (out.some((p) => dist(p.x, p.z, x, z) < 12)) continue;
    out.push({ x, z });
  }
  return out;
}

// Somebody stands at a place; walk up and they talk (Vikram answers). Optional: pay them first.
function meetStep(o) {
  let talked = false, asked = false, label = '';
  return {
    kind: 'meet',
    start: (g, m) => {
      let s = o.place || (o.at ? spot(g, o.at) : null);
      if (!s) {   // someone a short walk from the first contact
        const c = m.vars.contact || g.player;
        const q = ring(g, c.x, c.z, 25, 45, 1, (x, z) => !g.world.insideBlock(x, z))[0] || free(g, c.x + 30, c.z);
        s = { x: q.x, z: q.z, label: 'the street nearby' };
      }
      label = s.label;
      const p = K.person(g, m, s.x, s.z, o.yaw ?? PI * Math.random(), o.rig, { gesture: o.gesture || 'wait' });
      p.calm = true; p.walkTo = null;
      m.vars[o.name || 'contact'] = p;
      talked = false; asked = false;
      m.objective(o.text || `Meet ${title(o.who)} at ${s.label}`);
      m.marker(p.x, p.z, 2.2);
    },
    update: (g, m) => {
      const p = m.vars[o.name || 'contact'], P = g.player;
      if (!p || p.dead) { m.fail(`${title(o.who)} was hurt`); return false; }
      if (talked) return subsDone(g);
      m.marker(p.x, p.z, 2.2);
      const d = dist(P.x, P.z, p.x, p.z);
      if (P.inCar) { if (d < 16) m.objective(`Get out of the car and talk to ${title(o.who)}`); return false; }
      if (d > 3.2) { m.objective(o.text || `Meet ${title(o.who)} at ${label}`); return false; }
      // Pay first?
      if (o.price && !asked) {
        if (g.save.coins < o.price) {
          if (!m.vars.brokeSaid) { m.vars.brokeSaid = true; g.say([[o.who, `${o.price} rupees first. No money, no talk.`]]); }
          m.objective(`You need ₹${o.price}: pickpocket someone (walk up from behind, tap ROB)`);
          return false;
        }
        g.save.coins -= o.price; g.hud.popup(`-₹${o.price}`, 'bonus');
      }
      asked = true; talked = true; m.marker(null);
      p.faceTarget = P; P.yaw = yawOf(p.x - P.x, p.z - P.z);
      if (p.rig) p.rig.setGesture('talk');
      g.say(o.lines);
      if (o.onTalk) o.onTalk(g, m, p);
      return false;
    },
    end: (g, m) => { m.marker(null); const p = m.vars[o.name || 'contact']; if (p && p.rig && !p.follower) p.rig.setGesture('wait'); },
  };
}

// A shop: buy (or pick up) something. Not enough money? Rob someone and come back.
function gearStep(o, A) {
  let done = false;
  return {
    kind: 'gear',
    start: (g, m) => {
      done = false;
      // The market stall nearest to the meeting place (not right next to it).
      const from = m.vars.contact || g.player;
      const stalls = (g.world.spots.market || []).map((s) => ({ ...s, d: dist(s.x, s.z, from.x, from.z) })).filter((s) => s.d > 30).sort((a, b) => a.d - b.d);
      const st = stalls[0] ? free(g, stalls[0].x, stalls[0].z) : free(g, from.x + 25, from.z);
      const shop = K.person(g, m, st.x, st.z, stalls[0] ? stalls[0].yaw + PI : 0, o.price ? 'm_kurta' : 'm_hoodie', { gesture: 'talk' });
      shop.calm = true; m.vars.shop = shop;
      m.objective(o.price ? `Buy ${o.item} at the market (₹${o.price})` : `Collect ${o.item} from Sunny's man at the market`);
      m.marker(shop.x, shop.z, 2);
    },
    update: (g, m) => {
      const s = m.vars.shop, P = g.player;
      if (done) return subsDone(g);
      m.marker(s.x, s.z, 2);
      const d = dist(P.x, P.z, s.x, s.z);
      if (P.inCar) { if (d < 16) m.objective('Get out of the car and walk to the shop'); return false; }
      if (d > 3) { m.objective(o.price ? `Buy ${o.item} at the market (₹${o.price})` : `Collect ${o.item} at the market`); return false; }
      if (o.price && g.save.coins < o.price) {
        if (!m.vars.gearBroke) { m.vars.gearBroke = true; g.say([['VIKRAM', `Bhaiya, ${o.item}?`], ['SHOPKEEPER', `${o.price} rupees, cash only. No money, no ${o.item}!`]]); }
        m.objective(`You need ₹${o.price - g.save.coins} more: pickpocket someone (from behind, tap ROB) and come back`);
        return false;
      }
      done = true; m.marker(null);
      s.faceTarget = P; P.yaw = yawOf(s.x - P.x, s.z - P.z);
      if (o.price) { g.save.coins -= o.price; g.hud.popup(`${o.item.toUpperCase()}  -₹${o.price}`, 'bonus'); }
      else g.hud.popup(o.item.toUpperCase(), 'bonus');
      giveGear(g, o.give);
      g.say(o.price ? [['VIKRAM', `Bhaiya, ${o.item} dena.`], ['SHOPKEEPER', pick(['Le jao sahab, ekdum first class!', 'Best quality in Navapur, guaranteed!', 'For you, special price.'])]]
        : [['VIKRAM', 'Sunny sent me.'], ['SUNNY\'S MAN', `Here, ${o.item}. Careful with it!`]]);
      return false;
    },
    end: (g, m) => m.marker(null),
  };
}
function giveGear(g, give) {
  const P = g.player;
  if (give === 'armour') { P.armor = Math.max(P.armor || 0, 60); g.hud.popup('+ARMOUR', 'bonus'); }
  else if (give === 'ammo') { for (const id of P.owned) if (P.ammo[id]) P.ammo[id].reserve += 60; g.hud.popup('+AMMO', 'bonus'); }
  else if (give === 'health') P.health = P.maxHealth;
  else if (give === 'smg') { P.giveWeapon('smg', 120); P.weapon = 'smg'; }
}

// CCTV cameras near the job: photograph them (aim the camera, tap PHOTO).
function scoutStep(o, site, H) {
  let cams = [];
  const ph = K.photo(() => cams.map((c) => ({ x: c.x, y: 3.7, z: c.z })), o.what === 'corners' ? 'Photograph the tricky corners' : 'Photograph the CCTV cameras near the job', { range: 50 });
  return {
    kind: 'photo',
    start: (g, m) => {
      const T = H.THREE;
      cams = ring(g, site.x, site.z, 14, 42, o.n || 3, (x, z) => !g.world.insideBlock(x, z));
      if (cams.length < (o.n || 3)) cams = cams.concat(ring(g, site.x, site.z, 10, 70, (o.n || 3) - cams.length));
      for (const c of cams) {
        const G = new T.Group();
        const pole = new T.Mesh(new T.CylinderGeometry(0.07, 0.09, 3.6, 6), new T.MeshStandardMaterial({ color: 0x555b60 })); pole.position.y = 1.8; G.add(pole);
        const box = new T.Mesh(new T.BoxGeometry(0.28, 0.24, 0.55), new T.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.5 })); box.position.set(0, 3.7, 0.18); G.add(box);
        const led = new T.Mesh(new T.SphereGeometry(0.04, 6, 4), new T.MeshBasicMaterial({ color: new T.Color(3, 0.2, 0.2), toneMapped: false })); led.position.set(0, 3.78, 0.46); G.add(led);
        G.position.set(c.x, g.world.groundAt(c.x, c.z), c.z); G.rotation.y = Math.random() * PI * 2;
        g.scene.add(G); m.track(G);
      }
      ph.start(g, m);
    },
    update: (g, m, dt) => ph.update(g, m, dt),
    end: (g, m) => ph.end(g, m),
  };
}

// Gang lookouts near the job: take them out (quietly from behind = TAKEDOWN, or shoot them).
function lookoutStep(o, site) {
  return {
    kind: 'kill', group: 'look',
    start: (g, m) => {
      const pts = ring(g, site.x, site.z, 12, 38, o.n || 2);
      const list = pts.map((p) => {
        const a = Math.random() * PI * 2, q = free(g, p.x + Math.cos(a) * 7, p.z + Math.sin(a) * 7);
        return [p.x, p.z, a, [[p.x, p.z], [q.x, q.z]]];
      });
      K.guards(g, m, list, null, { group: 'look' });
      m.vars.lookN = list.length;
      m.objective(`Take out the lookouts near the job: 0 / ${list.length}`);
    },
    update: (g, m) => {
      const all = g.officers.filter((e) => e.group === 'look');
      const left = all.filter((e) => !e.dead);
      g.pins = left.map((e) => ({ x: e.x, z: e.z, color: '#ff5a4d' }));
      const T = g.dispatch.target, n = left.sort((a, b) => dist(a.x, a.z, T.x, T.z) - dist(b.x, b.z, T.x, T.z))[0];
      if (n) m.marker(n.x, n.z, 1.5, true);
      const alerted = left.some((e) => e.guard && e.guard.alerted);
      m.objective(`${alerted ? 'They saw you! Take them down' : 'Take out the lookouts quietly (from behind: TAKEDOWN)'}: ${m.vars.lookN - left.length} / ${m.vars.lookN}`);
      return left.length === 0;
    },
    end: (g, m) => { g.pins = []; m.marker(null); },
  };
}

// Raise cash: pickpocket rich people (from behind). Caught? New marks walk by - try again.
function cashStep(o) {
  let pp = null;
  const spawn = (g, m) => {
    const c = m.vars.contact || g.player;
    const pts = ring(g, c.x, c.z, 8, 30, o.n || 2, (x, z) => !g.world.insideBlock(x, z));
    const list = pts.map((p) => { const q = free(g, p.x + 8, p.z); return { at: [p.x, p.z], yaw: Math.random() * PI * 2, rig: pick(['m_office', 'f_coat', 'm_sweater', 'f_pink']), name: 'Rich shopper', cash: 600 + Math.floor(Math.random() * 400), walk: [[p.x, p.z], [q.x, q.z]] }; });
    pp = K.pickpocket(list, 'Pickpocket the rich shoppers (walk up from BEHIND, tap ROB)', { need: list.length });
    pp.start(g, m);
  };
  return {
    kind: 'rob',
    start: (g, m) => { m.actEvent = (G, M, type, data) => K.countRobs(G, M, type, data); spawn(g, m); },
    update: (g, m, dt) => {
      if (pp.update(g, m, dt)) return true;
      const marks = m.vars.marks || [], ok = m.vars.robOk || 0;
      if (marks.length && marks.every((p) => p.robbed)) {
        if (ok >= 1) return true;
        g.hud.toast('They saw you! Try again - from BEHIND this time.');
        spawn(g, m);
      }
      return false;
    },
    end: (g, m) => { if (pp) pp.end(g, m); m.actEvent = null; },
  };
}

// A snitch runs when he sees Vikram: chase and tackle him, then he talks.
function snitchStep(o) {
  let fc = null, phase = 0;
  return {
    kind: 'chase',
    start: (g, m) => {
      phase = 0;
      const c = m.vars.contact || g.player;
      const B = g.world.insideBlock(c.x + 20, c.z + 20) || g.world.insideBlock(c.x, c.z + 40) || g.world.insideBlock(c.x + 40, c.z);
      const cx = B ? B.cx : c.x + 37, cz = B ? B.cz : c.z + 37, h = 66 / 2 - 2.5;
      const route = [[cx - h, cz - h], [cx + h, cz - h], [cx + h, cz + h], [cx - h, cz + h], [cx - h, cz - h], [cx + h, cz - h]].map(([x, z]) => { const q = free(g, x, z); return [q.x, q.z]; });
      const s = free(g, route[0][0], route[0][1]);
      const r = K.person(g, m, s.x, s.z, 0, o.rig || 'm_hoodie', { gesture: 'phone' });
      m.vars.snitch = r; r.calm = true;
      fc = K.footChase('snitch', route, `Catch ${title(o.who)} (sprint and tackle him)`, { speed: 4.9, lose: 80, lost: `${title(o.who)} got away` });
      m.objective(`Find ${title(o.who)} near ${title(o.who) === 'Chintu' ? 'the next block' : 'the street'}`);
    },
    update: (g, m, dt) => {
      const r = m.vars.snitch, P = g.player;
      if (phase === 0) {
        m.marker(r.x, r.z, 1.5, true);
        if (dist(P.x, P.z, r.x, r.z) < 18) { phase = 1; g.say([[o.who, 'Vikram?! Bhaago!']]); fc.start(g, m); }
        return false;
      }
      if (phase === 1) { if (fc.update(g, m, dt)) { fc.end(g, m); phase = 2; g.say([['VIKRAM', 'Where is he?'], [o.who, o.line || 'Okay okay, I will tell you everything!']]); } return false; }
      return subsDone(g);
    },
    end: (g, m) => { m.marker(null); g.hud.hideProgress(); },
  };
}

// Steal a particular car (it waits at the kerb) and drive it to the job.
function rideStep(o, site, label) {
  return {
    kind: 'steal',
    start: (g, m) => {
      const c0 = m.vars.contact || g.player;
      const spots = g.world.parkingSpots().map((s) => ({ ...s, d: dist(s.x, s.z, c0.x, c0.z) }))
        .filter((s) => s.d > 60 && s.d < 160 && !g.cars.some((c) => dist(c.x, c.z, s.x, s.z) < 6)).sort((a, b) => a.d - b.d);
      const s = spots[Math.floor(Math.random() * Math.min(4, spots.length))] || { x: c0.x + 40, z: c0.z, yaw: 0 };
      const car = g.spawnParkedCar(o.type, o.color, s.x, s.z, s.yaw);
      car.missionCar = true; m.vars.rideCar = car; m.track(car);
      m.objective(`Steal ${o.name}`);
    },
    update: (g, m) => {
      const c = m.vars.rideCar;
      if (c.exploded) { m.fail(`${o.name[0].toUpperCase() + o.name.slice(1)} was destroyed`); return false; }
      if (g.driving.car !== c) { m.objective(`Steal ${o.name} (yellow marker)`); m.marker(c.x, c.z, 3, true); return false; }
      m.marker(site.x, site.z, 8);
      m.objective(`Drive ${o.name} to ${label}`);
      return near(g, site.x, site.z, 9);
    },
    end: (g, m) => m.marker(null),
  };
}

// A crew member joins (follows Vikram, rides in his car, fights).
function crewStep(o) {
  const ms = meetStep({ ...o, name: 'crewMate', text: null, lines: [['VIKRAM', `${title(o.who)}! Salim sent me.`], [o.who, 'I know. Chalo, where is the fight?']],
    onTalk: (g, m, p) => joinCrew(g, p, o.who) });
  return { ...ms, kind: 'meet' };
}

function joinCrew(g, p, who) {
  if (!p || p.follower || g.interact.followers.length >= 2) return;
  p.follower = true; p.calm = true; p.noInteract = true; p.walkSpeed = 1.6; p.maxHealth = p.health = 220;
  p.profile = { name: title(who), age: 29, job: 'Crew', fact: 'Never misses', cash: 0 };
  g.interact.followers.push(p);
  g.hud.popup(`${who} JOINED YOUR CREW`, 'combo');
}

// Grab things in a yard while guards patrol (get seen and they fight).
function intelStep(o, H) {
  let col = null;
  return {
    kind: 'collect',
    start: (g, m) => {
      const c = o.near ? spot(g, o.near) : (m.vars.contact || g.player);
      // The nearest block with a yard (not the bazaar or a park).
      let best = null;
      for (const [dx, dz] of [[0, 0], [75, 0], [-75, 0], [0, 75], [0, -75], [75, 75], [-75, 75], [75, -75], [-75, -75]]) {
        const B = g.world.insideBlock(c.x + dx, c.z + dz);
        if (B && ['old', 'start', 'ware'].includes(B.type) && (!best || dist(B.cx, B.cz, c.x, c.z) < dist(best.cx, best.cz, c.x, c.z))) best = B;
      }
      const B = best || g.world.insideBlock(37.5, 37.5);
      const pts = [];
      for (let k = 0; k < 60 && pts.length < o.n; k++) {
        const x = B.cx + (Math.random() - 0.5) * 22, z = B.cz + (Math.random() - 0.5) * 22;
        if (g.nav.free(g.nav.idx(x, z)) && pts.every((p) => dist(p[0], p[1], x, z) > 6)) pts.push([x, z]);
      }
      if (pts.length < o.n) pts.push([free(g, B.cx + 5, B.cz).x, free(g, B.cx + 5, B.cz).z]);
      K.guards(g, m, [[B.cx - 8, B.cz - 8, 0, [[B.cx - 8, B.cz - 8], [B.cx + 8, B.cz - 8]]], [B.cx + 8, B.cz + 8, PI, [[B.cx + 8, B.cz + 8], [B.cx - 8, B.cz + 8]]]]
        .map(([x, z, yw, path]) => { const q = free(g, x, z); return [q.x, q.z, yw, path.map(([a, b]) => { const r = free(g, a, b); return [r.x, r.z]; })]; }), null, { group: 'yard' });
      col = H.collect('intel', pts.slice(0, o.n), `Grab the ${o.what} in the yard (watchmen patrol it)`, { car: false });
      col.start(g, m);
    },
    update: (g, m, dt) => col.update(g, m, dt),
    end: (g, m) => col.end(g, m),
  };
}

// Stay at a place for a few seconds (tune the car, load the gold, fuel the boat...).
function tuneStep(o) {
  let t = 0;
  return {
    kind: 'hold',
    start: (g, m) => { t = 0; const s = spot(g, o.at); m.vars.tuneAt = s; m.objective(`Go to ${s.label}: ${o.label.toLowerCase()}`); m.marker(s.x, s.z, 4); },
    update: (g, m, dt) => {
      const s = m.vars.tuneAt;
      if (!near(g, s.x, s.z, 6)) { if (t > 0) g.hud.setProgress('Come back to finish!', t / o.sec, '#ff5a4d'); return false; }
      t += dt;
      g.hud.setProgress(`${o.label}... ${Math.ceil(o.sec - t)}s`, t / o.sec, '#ffc531');
      m.objective(`${o.label[0] + o.label.slice(1).toLowerCase()}: stay here`);
      return t >= o.sec;
    },
    end: (g, m) => { g.hud.hideProgress(); m.marker(null); },
  };
}

// Go to the job (arrive on foot: the job starts from there).
function siteStep(site, label) {
  return {
    kind: 'go',
    start: (g, m) => { m.objective(`Go to the job: ${label}`); m.marker(site.x, site.z, 6); },
    update: (g, m) => {
      const P = g.player;
      const close = near(g, site.x, site.z, 9);
      if (close && P.inCar) { m.objective('Get out of the car - the job starts here'); return false; }
      m.objective(`Go to the job: ${label}`);
      return close;
    },
    end: (g, m) => m.marker(null),
  };
}

// The police heard about the job.
const HEAT_RADIO = ['All units, all units! Robbery reported in Navapur!', 'Control room here. Suspect Vikram seen. Catch him!', 'Every jeep to the scene. He must not escape!'];
function heatStep(base) {
  return {
    kind: 'lose',
    start: (g, m) => {
      const n = Math.max(base || 0, (m.vars.extra && m.vars.extra.heat) || 0);
      if (g.dispatch.stars < n) { g.dispatch.setStars(n); g.say([['POLICE RADIO', pick(HEAT_RADIO)]]); }
      m.objective('Lose the police (they raid buildings too - do not just hide!)');
      m.music = 2;
    },
    update: (g, m) => { if (g.dispatch.stars === 0) { m.music = 1; g.hud.showBig('HEAT IS OFF', '#4dff66', 1.6); return true; } return false; },
  };
}

// Take the loot to a safehouse (enemies may wait there), then the contact there talks.
function stashStep(A, H, id) {
  let phase = 0, s = null, backupDone = false;
  const [who, rig, line] = A.end;
  const A0 = A;
  return {
    kind: 'stash',
    start: (g, m) => {
      phase = 0; backupDone = false; A = A0;
      const X = m.vars.extra || {};
      if (!A.twist && X.ambush) A = { ...A, twist: id % 2 ? 'gangcars' : 'ambush' };
      m.vars.needBackup = !!X.backup;
      const P = g.player;
      const keys = A.stash.concat(['garage', 'hideout', 'chai', 'press', 'promenade']);
      const cand = keys.map((k) => spot(g, k));
      s = cand.find((c) => dist(c.x, c.z, P.x, P.z) > 120) || cand.sort((a, b) => dist(b.x, b.z, P.x, P.z) - dist(a.x, a.z, P.x, P.z))[0];
      m.vars.stash = s;
      const r = K.person(g, m, s.x, s.z, Math.random() * PI * 2, rig, { gesture: 'wait' });
      r.calm = true; m.vars.receiver = r;
      m.objective(A.loot && A.loot !== 'nothing' ? `Take ${A.loot} to ${s.label}` : `Lie low at ${s.label}`);
      m.marker(s.x, s.z, 6);
    },
    update: (g, m, dt) => {
      const r = m.vars.receiver, P = g.player;
      if (phase === 0) {
        m.marker(s.x, s.z, 6);
        // The twist: they were waiting for you.
        if (A.twist && dist(P.x, P.z, s.x, s.z) < 55) {
          phase = 1;
          if (A.twist === 'gangcars') {
            // They stop on the road nearest the safehouse and jump out.
            const ni = g.network.nearest(s.x, s.z), node = g.network.nodes[ni] || { x: s.x, z: s.z };
            for (let k = 0; k < 2; k++) {
              const a = Math.random() * PI * 2;
              H.missionCar(g, m, 'suv', 0x2b2b2b, { mode: 'deploy', speed: 18, health: 140, hostile: true, fastBurn: true, dest: { x: node.x, z: node.z },
                onArrive: (car) => K.thugs(g, m, [[car.x + 2, car.z + 2], [car.x - 2, car.z - 2]].map(([x, z]) => { const q = free(g, x, z); return [q.x, q.z]; }), { group: 'amb' }) },
              { node: true, x: s.x + Math.cos(a) * 110, z: s.z + Math.sin(a) * 110, hx: -Math.cos(a), hz: -Math.sin(a) });
            }
            m.vars.ambWait = 25;
          } else {
            const pts = ring(g, s.x, s.z, 7, 18, 4);
            K.thugs(g, m, pts.map((p) => [p.x, p.z]), { group: 'amb' });
          }
          g.say([['VIKRAM', 'Trap! They were waiting for me!']]);
          m.music = 3;
        }
        // Burned safehouse: police tape everywhere - go to the backup one.
        if (phase === 0 && m.vars.needBackup && !backupDone && dist(P.x, P.z, s.x, s.z) < 20) {
          backupDone = true;
          const keys = ['garage', 'hideout', 'press', 'chai', 'docks', 'busDepot', 'parkE', 'promenade'];
          const b = keys.map((k) => spot(g, k)).filter((c) => dist(c.x, c.z, s.x, s.z) > 150).sort(() => Math.random() - 0.5)[0] || spot(g, 'garage');
          g.say([[who, 'Don\'t stop here! Police were here an hour ago. Meet me at ' + b.label + '!']]);
          s = b; m.vars.stash = b;
          r.x = b.x; r.z = b.z; if (r.mesh) r.mesh.position.set(b.x, g.world.groundAt(b.x, b.z), b.z);
          if (g.dispatch.stars < 1) g.dispatch.setStars(1);
          m.objective(`The safehouse is burned! Go to ${b.label}`);
          return false;
        }
        if (phase === 0 && g.dispatch.stars > 0 && dist(P.x, P.z, s.x, s.z) < 40) { m.objective(`Lose the police first - do not lead them to ${title(who)}!`); return false; }
        if (phase === 0 && dist(P.x, P.z, r.x, r.z) < 3.2 && !P.inCar) phase = 2;
        else if (phase === 0) { if (P.inCar && dist(P.x, P.z, s.x, s.z) < 14) m.objective(`Get out and meet ${title(who)}`); return false; }
      }
      if (phase === 1) {
        const left = g.officers.filter((e) => e.group === 'amb' && !e.dead);
        m.vars.ambWait = (m.vars.ambWait || 0) - dt;
        const cars = m.ents.filter((e) => e.isCar && e.mode === 'deploy' && !e.exploded && !e.arrived);
        g.pins = left.map((e) => ({ x: e.x, z: e.z, color: '#ff5a4d' }));
        m.objective(`Take down the ambush: ${left.length} left`);
        if (left.length || (cars.length && m.vars.ambWait > 0)) return false;
        g.pins = []; m.music = 1; phase = 0;
        A = { ...A, twist: null };
        return false;
      }
      if (phase === 2) {
        phase = 3; m.marker(null);
        r.faceTarget = P; P.yaw = yawOf(r.x - P.x, r.z - P.z);
        if (r.rig) r.rig.setGesture('talk');
        g.say([['VIKRAM', pick(['Done. Clean job.', 'Here. Just like I promised.', 'All done. Nobody followed me.'])], [who, line]]);
        return false;
      }
      return subsDone(g);
    },
    end: (g, m) => { g.pins = []; m.marker(null); },
  };
}

// The start of an act: banner, checkpoint, timers.
function actStep(n, def) {
  const NAMES = ['', 'THE PLAN', 'THE JOB', 'THE GETAWAY'];
  return {
    kind: 'act', actN: n,
    start: (g, m) => {
      m.act = n;
      if (n > 1) g.hud.showBig(`ACT ${n} · ${NAMES[n]}`, n === 3 ? '#ff7a4d' : '#ffc531', 2.2);   // act 1: the mission card is enough
      const P = g.player, car = g.driving.car;
      g.checkpoint = { id: def.id, act: n, x: P.x, z: P.z, yaw: P.yaw, inCar: !!P.inCar, carType: car ? car.type : null, carColor: car ? car.color : null };
      if (n > 1) g.hud.toast('CHECKPOINT SAVED');
      if (n === 2) {
        // The job: its own clock, timer and set-up (as the mission was before).
        if (m.vars.contact && !m.vars.contact.follower) { m.vars.contact.remove(); m.vars.contact = null; }
        m.elapsed = 0; m.timeLeft = null;
        if (def.timer) m.timer(Math.round(def.timer * 0.92));
        if (def.setup) def.setup(g, m);
        g.say([['VIKRAM', pick(['Okay. Time for the job.', 'Chalo, let\'s do this.', 'Focus, Vikram. This is it.'])]]);
      }
      if (n === 3) {
        m.timeLeft = null; m.holdStars = false; m.jobTime = m.elapsed;
        m.vars.extra = getawayExtras(m);
        g.say([['VIKRAM', pick(['Done! Now get out of here.', 'Job done. Now the hard part: getting away.', 'Shabash, Vikram. Now disappear.'])]]);
      }
    },
    update: () => true,
  };
}

// Back at a checkpoint: put Vikram where the act started.
function restoreStep(def, n) {
  return {
    kind: 'act',
    start: (g, m) => {
      const cp = g.checkpoint && g.checkpoint.id === def.id ? g.checkpoint : null;
      const S = SITES[def.id] || [6.6, 19.5];
      const x = n === 3 && cp ? cp.x : S[0], z = n === 3 && cp ? cp.z : S[1];
      const p = free(g, x, z);
      g.placePlayer(p.x, p.z, cp ? cp.yaw : 0);
      g.player.giveWeapon('smg', 150);
      const A = ACTS[def.id];
      for (const pr of A.prep) if (pr.t === 'gear') giveGear(g, pr.give);
      if (n === 3 && cp && cp.inCar && cp.carType && !['bus', 'boat'].includes(cp.carType)) {
        const c = g.spawnParkedCar(cp.carType, cp.carColor ?? 0x1d1e22, p.x + 3, p.z, cp.yaw || 0);
        c.missionCar = true; m.track(c);
      }
    },
    update: () => true,
  };
}

// Every mission gets at least two jobs to prepare. The second one depends on the first.
function withSecondPrep(A, id) {
  if (A.prep.length >= 2) return A.prep;
  const p = A.prep[0];
  const pool = {
    gear: [{ t: 'scout', n: 2 }, { t: 'lookouts', n: 2 }, { t: 'cash', n: 1 }, { t: 'scout', n: 3 }],
    scout: [{ t: 'lookouts', n: 2 }], lookouts: [{ t: 'scout', n: 2 }], tune: [{ t: 'scout', n: 2 }, { t: 'lookouts', n: 2 }],
    crew: [gear('a bulletproof vest', 500, 'armour')], bribe: [{ t: 'scout', n: 2 }, { t: 'lookouts', n: 2 }],
    intel: [{ t: 'lookouts', n: 2 }], cash: [{ t: 'scout', n: 2 }], snitch: [{ t: 'lookouts', n: 2 }], ride: [{ t: 'scout', n: 2 }],
  }[p.t] || [{ t: 'scout', n: 2 }];
  const extra = pool[id % pool.length];
  return p.t === 'ride' ? [extra, p] : [p, extra];   // the stolen car is driven to the job last
}

// Too fast? The getaway gets harder so that every mission lasts at least ~5 minutes:
// more police stars, men waiting at the safehouse, or the safehouse is burned (go to a backup one).
function getawayExtras(m) {
  const left = 300 - m.totalElapsed;
  return { heat: left > 0 ? 2 : 0, ambush: left > 100, backup: left > 170 };
}

// ---------- Build the mission: plan + job + getaway ----------
function buildSteps(def, A, core, m, H) {
  const from = m.fromAct || 1;
  const S = SITES[def.id] || [6.6, 19.5];
  const site = { x: S[0], z: S[1] };
  const out = [];
  const who = A.meet[1];
  if (from <= 1) {
    const [at, , rig, lines, vik] = A.meet;
    out.push(actStep(1, def));
    out.push({ kind: 'act', start: (g) => g.placePlayer(6.6, 19.5, -PI / 2), update: () => true });   // Vikram's place, next to the chai stall
    out.push(meetStep({ at, who, rig, lines: [['VIKRAM', `${who.includes('DADI') ? 'Namaste Dadi.' : who === 'RAVI' ? 'Ravi bhai!' : 'Namaste.'}`], ...lines.map((l) => [who, l]), ['VIKRAM', vik]] }));
    for (const p of withSecondPrep(A, def.id)) {
      if (p.t === 'gear') out.push(gearStep(p, A));
      else if (p.t === 'scout') out.push(scoutStep(p, site, H));
      else if (p.t === 'lookouts') out.push(lookoutStep(p, site));
      else if (p.t === 'cash') out.push(cashStep(p));
      else if (p.t === 'snitch') out.push(snitchStep(p));
      else if (p.t === 'ride') out.push(rideStep(p, site, A.site));
      else if (p.t === 'crew' && p.who === who) out.push({ kind: 'act', start: (g, m) => joinCrew(g, m.vars.contact, who), update: () => true });
      else if (p.t === 'crew') out.push(crewStep({ at: p.at || A.meet[0], who: p.who, rig: p.rig }));
      else if (p.t === 'intel') out.push(intelStep(p, H));
      else if (p.t === 'tune') out.push(tuneStep(p));
      else if (p.t === 'bribe') out.push(meetStep({ at: p.at || null, who: p.who, rig: p.rig, price: p.price, name: 'bribe', text: p.price ? `Pay ${title(p.who)} ₹${p.price} for information` : `Talk to ${title(p.who)}`,
        lines: [['VIKRAM', p.price ? `Here, ${p.price} rupees. Talk.` : 'Quick, tell me.'], [p.who, p.line]] }));
    }
    out.push(siteStep(site, A.site));
  }
  if (from === 2) out.push(restoreStep(def, 2));
  if (from <= 2) { out.push(actStep(2, def)); out.push(...core(m)); }
  if (from === 3) out.push(restoreStep(def, 3));
  out.push(actStep(3, def));
  out.push(heatStep(A.heat));
  out.push(stashStep(A, H, def.id));
  return out;
}

// Turn every mission into a three-act mission.
export function installActs(MISSIONS, H) {
  for (const def of MISSIONS) {
    const A = ACTS[def.id];
    if (!A || def.acts) continue;
    def.acts = A;
    const core = def.steps;
    def.steps = (m) => buildSteps(def, A, core, m, H);
    def.reward = Math.round((def.reward * 1.6) / 100) * 100;   // longer, harder missions pay more
  }
}
export { ACTS };
