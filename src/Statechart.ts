import {InternalEvent, Event, NodeBody} from './types';
import State from './State';
import Node from './Node';

export default class Statechart<C, E extends Event> {
  public initialContext: C;
  private root: Node<C, E>;
  private _initialState?: State<C, E>;

  constructor(context: C, body: NodeBody<C, E>) {
    this.root = new Node('', body);
    this.initialContext = context;
  }

  get initialState(): State<C, E> {
    return (
      this._initialState ||
      (this._initialState = this.root._enter(
        new State({context: this.initialContext}),
        {type: '__start__'},
        [],
      ))
    );
  }

  stop(state: State<C, E>): State<C, E> {
    return this.root._exit(state, {type: '__stop__'});
  }

  send(state: State<C, E>, evt: InternalEvent | E): State<C, E> {
    const seen = new Set<Node<C, E>>();
    const transitions: {
      pivot: Node<C, E>;
      to: Node<C, E>[];
      self: boolean;
    }[] = [];

    state = state.update({
      actions: [],
      activities: {
        ...state.activities,
        start: [],
        stop: [],
      },
    });

    for (const node of state.current) {
      let n: Node<C, E> | undefined = node;

      while (n && !seen.has(n)) {
        seen.add(n);

        const result = n.send(state, evt);

        if (!result) {
          n = n.parent;
          continue;
        }

        state = result.state;

        if (result.goto.length) {
          const pivots = new Set<Node<C, E>>();
          const self = result.goto.every(n => node.lineage.includes(n));

          for (const node of result.goto) {
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
              `Statechart#send: invalid transition, multiple pivot states found between ${n} and ${result.goto}`,
            );
          }

          const pivot = Array.from(pivots)[0];

          if (pivot.type === 'concurrent') {
            throw new Error(
              `Statechart#send: invalid transition, ${n} to ${result.goto} crosses a concurrency boundary`,
            );
          }

          transitions.push({pivot, to: result.goto, self});
        }

        break;
      }
    }

    for (const {pivot, to, self} of transitions) {
      state = self ? pivot._exit(state, evt) : pivot.pivotExit(state, evt);
      state = self
        ? pivot._enter(state, evt, to)
        : pivot.pivotEnter(state, evt, to);
    }

    return state;
  }

  inspect(state?: State<C, E>): string {
    return this.root.inspect({state});
  }
}
