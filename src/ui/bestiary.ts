import { AGES, AGE_TURRETS, AGE_UNITS, POWERS } from '../sim/data.ts';
import { h, onTap } from './dom.ts';
import { CLASS_COLOR, CLASS_ICON, CLASS_NAME } from './icons.ts';
import { TEMPERS } from '../render/creatures/tempers.ts';
import { heroNamesOf } from './heroes.ts';
import { portrait } from './portraits.ts';

/** Where each creature comes from: one or two lines of the myth behind it. */
export const MYTHS: Record<string, string> = {
  treant: 'Walking trees stride through European folklore; Tolkien’s Ents gave them their modern shape. The Celts held the oak sacred — “druid” may mean “oak-knower”.',
  redcap: 'A murderous goblin of the Anglo-Scottish border that haunts ruined castles and dyes its cap in travellers’ blood. If the cap ever dries, the redcap dies.',
  pixie: 'Small, mischievous spirits of Cornwall and Devon. To be “pixie-led” is to lose your way on a road you know well.',
  minotaur: 'Born to Queen Pasiphaë of Crete and a sacred bull, it was shut in the Labyrinth that Daedalus built, until Theseus found his way in — and, thanks to Ariadne’s thread, out again.',
  centaur: 'The centaurs of Thessaly were wild and quarrelsome — all but wise Chiron, who taught Achilles, Jason and the healer Asclepius.',
  gorgon: 'Three sisters with snakes for hair. A glance from Medusa, the only mortal one, turned flesh to stone; Perseus beheaded her by watching her reflection in a polished shield.',
  jotunn: 'The jötnar are the giants of Norse myth, rivals of the gods. Odin and his brothers shaped the world from the body of the first of them, Ymir.',
  fenrir: 'Loki’s monstrous son, bound by the gods with the silken fetter Gleipnir — at the cost of the god Týr’s hand. At Ragnarök he breaks free and swallows Odin.',
  valkyrie: '“Choosers of the slain”: Odin’s shieldmaidens ride above the battlefield and carry the bravest of the fallen to Valhalla.',
  oni: 'The horned ogres of Japanese folklore, armed with iron clubs. “Like giving an oni an iron club” means making the strong even stronger.',
  byakko: 'The White Tiger, one of the Four Symbols of the Chinese sky: guardian of the West and of autumn.',
  kitsune: 'In Japanese folklore foxes grow wiser and stronger with age; the oldest grow nine tails. Their ghostly foxfire, kitsunebi, lights the night.',
  titan: 'Children of Gaia and Uranus, the Titans ruled before the gods of Olympus — until Zeus overthrew Cronus in the ten-year Titanomachy.',
  griffin: 'Lion and eagle, king of beasts and king of birds. In Greek tales griffins guarded the gold of the far north.',
  phoenix: 'The firebird lives for centuries, then bursts into flame and rises from its own ashes. Herodotus heard of it from the priests of Heliopolis.',
  dragon: 'Dragons coil through the myths of nearly every people — Fáfnir on his hoard, Tiamat of the primordial sea, the rain-bringing long of China. The eldest are older than the gods.',
};

/**
 * The Bestiary: every age's creatures, god power and turrets, with the myths behind them. Ages
 * the player has never reached stay hidden (silhouettes, "???") — they are discovered in battle.
 */
export class Bestiary {
  readonly el: HTMLElement;
  private tabs: HTMLButtonElement[] = [];
  private page: HTMLElement;
  private age = 0;
  private seen = 0;

  private readonly sound: (kind: string) => void;

  constructor(back: HTMLButtonElement, sound: (kind: string) => void) {
    this.sound = sound;
    const tabs = h('div', { class: 'btabs', role: 'tablist' });
    AGES.forEach((_age, i) => {
      const t = h('button', { class: 'btab', role: 'tab' }, h('b', { text: ['I', 'II', 'III', 'IV', 'V'][i] }), h('span'));
      onTap(t, () => {
        this.sound('select');
        this.show(i);
      });
      this.tabs.push(t);
      tabs.appendChild(t);
    });
    this.page = h('div', { class: 'bpage', role: 'tabpanel' });
    this.el = h('div', { class: 'screen bestiary' }, h('h2', { text: 'Bestiary' }), tabs, this.page, h('div', { class: 'mrow' }, back));
  }

  /** Opens on the newest age the player knows. `seen`: the highest age ever reached. */
  open(seen: number): void {
    this.seen = seen;
    this.show(Math.min(this.age, seen));
  }

  private show(i: number): void {
    this.age = i;
    const known = i <= this.seen;
    this.tabs.forEach((t, k) => {
      t.classList.toggle('on', k === i);
      t.setAttribute('aria-selected', String(k === i));
      t.querySelector('span')!.textContent = k <= this.seen ? AGES[k].name : '???';
    });
    const age = AGES[i];
    const p = this.page;
    p.innerHTML = '';
    p.appendChild(h('div', { class: 'bhead' }, h('b', { text: known ? `${age.name} — ${age.subtitle}` : '???' }), h('i', { text: known ? age.lore : 'Reach this age in battle to learn who waits there.' })));
    const grid = h('div', { class: 'bgrid' });
    for (const def of AGE_UNITS[i]) {
      const text = known
        ? [
            h('div', { class: 'bname' }, h('span', { class: 'bico', style: `color:${CLASS_COLOR[def.cls]}`, html: CLASS_ICON[def.cls] }), h('b', { text: def.name }), TEMPERS[def.id] ? h('i', { class: 'btemper', text: TEMPERS[def.id].word.toLowerCase() }) : null),
            h('div', { class: 'bmeta', text: `${CLASS_NAME[def.cls]} · ${def.projectile ? 'Ranged' : 'Melee'} · ${def.cost} gold` }),
            def.traitText ? h('div', { class: 'btrait', text: def.traitText }) : null,
            h('div', { class: 'bmyth', text: MYTHS[def.id] ?? def.blurb }),
            // (Lens #88: the names its veterans earn — and a hint that veterans exist.)
            heroNamesOf(def.id).length ? h('div', { class: 'bheroes', text: `Veterans are named ${heroNamesOf(def.id).join(', ')}.` }) : null,
          ]
        : [h('div', { class: 'bname' }, h('b', { text: '???' }))];
      grid.appendChild(h('div', { class: `bentry${known ? '' : ' unknown'}` }, portrait(def.id, 64), h('div', { class: 'btext' }, ...text)));
    }
    p.appendChild(grid);
    if (known) {
      const power = POWERS[age.power];
      const [bolt, blast] = AGE_TURRETS[i];
      p.appendChild(
        h(
          'div',
          { class: 'bextra' },
          h('div', null, h('b', { text: `God power — ${power.name}: ` }), power.blurb),
          h('div', null, h('b', { text: 'Turrets — ' }), `${bolt.name}: ${bolt.blurb} ${blast.name}: ${blast.blurb}`),
        ),
      );
    }
  }
}
