// All user-facing names for roles, parties and powers. Rename things here.

export const THEME = {
  title: 'Secret Austrian',
  liberal: 'Liberal',
  fascist: 'Fascist',
  leader: 'the Austrian',
  leaderTitle: 'The Austrian',
  ja: 'Ja!',
  nein: 'Nein',
};

export const ROLE_NAMES = {
  liberal: THEME.liberal,
  fascist: THEME.fascist,
  leader: THEME.leaderTitle,
};

export const POWER_NAMES = {
  investigate: 'Investigate loyalty',
  peek: 'Policy peek',
  special: 'Special election',
  execute: 'Execution',
};

export const POWER_VERBS = {
  investigate: "investigate a player's party membership",
  peek: 'look at the top three policies',
  special: 'pick the next presidential candidate',
  execute: 'execute a player',
};
