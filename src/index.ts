// src/parser-combinator/types.ts
export interface ParseResult<T> {
  success: boolean;
  value?: T;
  index: number;
  error?: string;
}

export interface ParseState {
  input: string;
  index: number;
}

export type ParserFn<T> = (state: ParseState) => ParseResult<T>;

export class Parser<T> {
  constructor(public parse: ParserFn<T>) {}

  map<U>(fn: (value: T) => U): Parser<U> {
    return new Parser(state => {
      const result = this.parse(state);
      if (!result.success) return result;
      return {
        success: true,
        value: fn(result.value!),
        index: result.index
      };
    });
  }

  chain<U>(fn: (value: T) => Parser<U>): Parser<U> {
    return new Parser(state => {
      const result = this.parse(state);
      if (!result.success) return result;
      return fn(result.value!).parse({ ...state, index: result.index });
    });
  }

  or(other: Parser<T>): Parser<T> {
    return new Parser(state => {
      const result = this.parse(state);
      if (result.success) return result;
      return other.parse(state);
    });
  }

  then<U>(other: Parser<U>): Parser<U> {
    return this.chain(() => other);
  }

  skip<U>(other: Parser<U>): Parser<T> {
    return this.chain(value => other.map(() => value));
  }

  many(): Parser<T[]> {
    return new Parser(state => {
      const results: T[] = [];
      let currentState = state;
      
      while (true) {
        const result = this.parse(currentState);
        if (!result.success) break;
        
        results.push(result.value!);
        currentState = { ...currentState, index: result.index };
      }
      
      return {
        success: true,
        value: results,
        index: currentState.index
      };
    });
  }

  many1(): Parser<T[]> {
    return new Parser(state => {
      const result = this.many().parse(state);
      if (!result.success) return result;
      if (result.value!.length === 0) {
        return {
          success: false,
          index: state.index,
          error: 'Expected at least one match'
        };
      }
      return result;
    });
  }

  optional(): Parser<T | null> {
    return new Parser(state => {
      const result = this.parse(state);
      if (result.success) return result;
      return {
        success: true,
        value: null,
        index: state.index
      };
    });
  }

  trim(): Parser<T> {
    return whitespace.then(this).skip(whitespace);
  }
}

// src/parser-combinator/primitives.ts
export const str = (s: string): Parser<string> =>
  new Parser(state => {
    const { input, index } = state;
    if (input.slice(index).startsWith(s)) {
      return {
        success: true,
        value: s,
        index: index + s.length
      };
    }
    return {
      success: false,
      index,
      error: `Expected "${s}"`
    };
  });

export const regex = (pattern: RegExp): Parser<string> =>
  new Parser(state => {
    const { input, index } = state;
    pattern.lastIndex = index;
    const match = pattern.exec(input);
    
    if (match && match.index === index) {
      return {
        success: true,
        value: match[0],
        index: index + match[0].length
      };
    }
    
    return {
      success: false,
      index,
      error: `Expected pattern ${pattern}`
    };
  });

export const succeed = <T>(value: T): Parser<T> =>
  new Parser(state => ({
    success: true,
    value,
    index: state.index
  }));

export const fail = (error: string): Parser<never> =>
  new Parser(state => ({
    success: false,
    index: state.index,
    error
  }));

export const eof = new Parser<null>(state => {
  if (state.index >= state.input.length) {
    return {
      success: true,
      value: null,
      index: state.index
    };
  }
  return {
    success: false,
    index: state.index,
    error: 'Expected end of input'
  };
});

// src/parser-combinator/combinators.ts
export const lazy = <T>(parserThunk: () => Parser<T>): Parser<T> =>
  new Parser(state => {
    const parser = parserThunk();
    return parser.parse(state);
  });

export const sepBy = <T, U>(
  parser: Parser<T>,
  separator: Parser<U>
): Parser<T[]> =>
  new Parser(state => {
    const results: T[] = [];
    let currentState = state;

    // Parse first element
    const firstResult = parser.parse(currentState);
    if (!firstResult.success) {
      return {
        success: true,
        value: results,
        index: currentState.index
      };
    }

    results.push(firstResult.value!);
    currentState = { ...currentState, index: firstResult.index };

    // Parse subsequent elements
    while (true) {
      const sepResult = separator.parse(currentState);
      if (!sepResult.success) break;

      const elemResult = parser.parse({
        ...currentState,
        index: sepResult.index
      });
      
      if (!elemResult.success) break;

      results.push(elemResult.value!);
      currentState = { ...currentState, index: elemResult.index };
    }

    return {
      success: true,
      value: results,
      index: currentState.index
    };
  });

export const between = <T, U, V>(
  open: Parser<U>,
  close: Parser<V>,
  parser: Parser<T>
): Parser<T> =>
  open.then(parser).skip(close);

export const choice = <T>(parsers: Parser<T>[]): Parser<T> =>
  parsers.reduce((acc, parser) => acc.or(parser));

// Common parsers
export const whitespace = regex(/^\s*/);
export const digits = regex(/^[0-9]+/);
export const letters = regex(/^[a-zA-Z]+/);
export const alphanumeric = regex(/^[a-zA-Z0-9]+/);
export const identifier = regex(/^[a-zA-Z_][a-zA-Z0-9_]*/);

// Helper functions
export const sequence = <T>(parsers: Parser<T>[]): Parser<T[]> =>
  new Parser(state => {
    const results: T[] = [];
    let currentState = state;

    for (const parser of parsers) {
      const result = parser.parse(currentState);
      if (!result.success) return result;
      
      results.push(result.value!);
      currentState = { ...currentState, index: result.index };
    }

    return {
      success: true,
      value: results,
      index: currentState.index
    };
  });

// Additional utility combinators
export const not = <T>(parser: Parser<T>): Parser<null> =>
  new Parser(state => {
    const result = parser.parse(state);
    if (result.success) {
      return {
        success: false,
        index: state.index,
        error: 'Unexpected match'
      };
    }
    return {
      success: true,
      value: null,
      index: state.index
    };
  });

export const lookAhead = <T>(parser: Parser<T>): Parser<T> =>
  new Parser(state => {
    const result = parser.parse(state);
    if (!result.success) return result;
    return {
      ...result,
      index: state.index
    };
  });

export const takeUntil = <T>(parser: Parser<T>): Parser<string> =>
  new Parser(state => {
    let currentIndex = state.index;
    while (currentIndex < state.input.length) {
      const result = parser.parse({
        input: state.input,
        index: currentIndex
      });
      
      if (result.success) {
        return {
          success: true,
          value: state.input.slice(state.index, currentIndex),
          index: currentIndex
        };
      }
      
      currentIndex++;
    }
    
    return {
      success: true,
      value: state.input.slice(state.index),
      index: state.input.length
    };
  });

// Example usage:
/*
const numberParser = digits.map(Number);
const stringParser = between(
  str('"'),
  str('"'),
  takeUntil(str('"'))
);

const arrayParser = between(
  str('['),
  str(']'),
  sepBy(
    choice([numberParser, stringParser]),
    str(',').trim()
  )
);

const input = '[1, "hello", 42]';
const result = arrayParser.parse({ input, index: 0 });
console.log(result);
*/
