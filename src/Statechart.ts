import Node, {Effect, Event} from './Node';

export interface State<C, E extends Event> {
  current: Node<C, E>[];
  context: C;
  effects: Effect<E>[];
}

export default class Statechart<C, E extends Event> {
  private root: Node<C, E>;
  private initialContext: C;

  constructor(context: C, body: (n: Node<C, E>) => void) {
    this.root = new Node('', {}, body);
    this.initialContext = context;
  }

  get initialState(): State<C, E> {
    const [context, effects, current] = this.root._enter(
      this.initialContext,
      {
        type: '__init__',
      } as E,
      [],
    );

    return {current, context, effects};
  }

  send(state: State<C, E>, evt: E): State<C, E> {
    let context = state.context;
    const seen = new Set<Node<C, E>>();
    const effects: Effect<E>[] = [];
    const transitions: {pivot: Node<C, E>; to: Node<C, E>[]}[] = [];

    for (const node of state.current) {
      let n: Node<C, E> | undefined = node;

      while (n && !seen.has(n)) {
        seen.add(n);

        const result = n.send(context, evt);

        if (!result) {
          n = n.parent;
          continue;
        }

        const [c, es, to] = result;
        context = c;
        effects.push(...es);

        const pivots = new Set<Node<C, E>>();

        for (const node of to) {
          const pivot = n.pivot(node);
          if (!pivot) {
            throw new Error(
              `Statechart#send: could not find pivot between ${n} and ${node}`,
            );
          }
          pivots.add(pivot);
        }

        if (pivots.size > 1) {
          throw new Error(
            `Statechart#send: invalid transition, multiple pivot states found between ${n} and ${to}`,
          );
        }

        transitions.push({pivot: Array.from(pivots)[0], to});
      }
    }

    const current: Node<C, E>[] = [];

    for (const {pivot, to} of transitions) {
      const [exitCtx, exitEffects] = pivot.pivotExit(
        context,
        evt,
        state.current,
      );
      context = exitCtx;
      effects.push(...exitEffects);

      const [enterCtx, enterEffects, nodes] = pivot.pivotEnter(
        context,
        evt,
        to,
      );
      context = enterCtx;
      effects.push(...enterEffects);
      current.push(...nodes);
    }

    return {current, context, effects};
  }
}
