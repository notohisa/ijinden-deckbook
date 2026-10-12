export type SimpleCardState =
  | 'normal'
  | 'mana'
  | 'manaBack'
  | 'battlefield'
  | 'graveyard'
  | 'equipped';

const stateOrder: readonly SimpleCardState[] = [
  'normal',
  'mana',
  'manaBack',
  'battlefield',
  'graveyard',
  'equipped',
];

export function getNextSimpleCardState(
  state: SimpleCardState,
): SimpleCardState {
  const stateIndex = stateOrder.indexOf(state);
  return stateOrder[(stateIndex + 1) % stateOrder.length];
}
