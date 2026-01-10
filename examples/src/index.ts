/**
 * Example module demonstrating Mermaid diagrams in TypeDoc documentation.
 *
 * This module contains various examples of embedded Mermaid diagrams in TSDoc
 * comments to test the typedoc-plugin-mermaid plugin.
 *
 * ```mermaid
 * flowchart LR
 *   A[Source Code] --> B[TypeDoc]
 *   B --> C[HTML Output]
 *   C --> D[Mermaid Plugin]
 *   D --> E[Rendered Diagrams]
 * ```
 *
 * @packageDocumentation
 */

/**
 * Represents the state of an order in the system.
 *
 * ```mermaid
 * stateDiagram-v2
 *   [*] --> Pending
 *   Pending --> Processing: pay()
 *   Processing --> Shipped: ship()
 *   Processing --> Cancelled: cancel()
 *   Shipped --> Delivered: deliver()
 *   Delivered --> [*]
 *   Cancelled --> [*]
 * ```
 */
export type OrderStatus =
  | 'pending'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled';

/**
 * A simple state machine for managing workflows.
 *
 * ## State Diagram
 *
 * ```mermaid
 * stateDiagram-v2
 *   [*] --> Idle
 *   Idle --> Running: start()
 *   Running --> Paused: pause()
 *   Running --> Completed: complete()
 *   Running --> Failed: fail()
 *   Paused --> Running: resume()
 *   Paused --> Cancelled: cancel()
 *   Completed --> [*]
 *   Failed --> Idle: reset()
 *   Cancelled --> [*]
 * ```
 *
 * ## Class Structure
 *
 * ```mermaid
 * classDiagram
 *   class StateMachine {
 *     -state: State
 *     +start() void
 *     +pause() void
 *     +resume() void
 *     +complete() void
 *     +fail() void
 *     +reset() void
 *   }
 * ```
 */
export class StateMachine {
  private state: 'idle' | 'running' | 'paused' | 'completed' | 'failed' =
    'idle';

  /**
   * Start the state machine.
   *
   * ```mermaid
   * sequenceDiagram
   *   participant Client
   *   participant SM as StateMachine
   *   Client->>SM: start()
   *   SM->>SM: validate state
   *   SM-->>Client: void
   * ```
   */
  start(): void {
    if (this.state === 'idle') {
      this.state = 'running';
    }
  }

  /** Pause the running state machine. */
  pause(): void {
    if (this.state === 'running') {
      this.state = 'paused';
    }
  }

  /** Resume a paused state machine. */
  resume(): void {
    if (this.state === 'paused') {
      this.state = 'running';
    }
  }

  /** Mark the state machine as completed. */
  complete(): void {
    if (this.state === 'running') {
      this.state = 'completed';
    }
  }

  /** Mark the state machine as failed. */
  fail(): void {
    if (this.state === 'running') {
      this.state = 'failed';
    }
  }

  /** Reset a failed state machine back to idle. */
  reset(): void {
    if (this.state === 'failed') {
      this.state = 'idle';
    }
  }

  /** Get the current state. */
  getState(): string {
    return this.state;
  }
}

/**
 * Process data through a pipeline.
 *
 * ```mermaid
 * flowchart TD
 *   A[Input Data] --> B{Validate}
 *   B -->|Valid| C[Transform]
 *   B -->|Invalid| D[Error]
 *   C --> E[Output]
 *   D --> F[Log Error]
 * ```
 *
 * @param data - The input data to process
 * @returns The processed output
 */
export const processData = (data: unknown): string => {
  if (typeof data !== 'string') {
    throw new Error('Invalid data type');
  }
  return data.toUpperCase();
};

/**
 * Database entity relationships.
 *
 * ```mermaid
 * erDiagram
 *   USER ||--o{ ORDER : places
 *   ORDER ||--|{ LINE_ITEM : contains
 *   PRODUCT ||--o{ LINE_ITEM : "is in"
 *   USER {
 *     int id PK
 *     string name
 *     string email
 *   }
 *   ORDER {
 *     int id PK
 *     int user_id FK
 *     date created_at
 *   }
 *   PRODUCT {
 *     int id PK
 *     string name
 *     decimal price
 *   }
 *   LINE_ITEM {
 *     int order_id FK
 *     int product_id FK
 *     int quantity
 *   }
 * ```
 */
export interface DatabaseSchema {
  users: User[];
  orders: Order[];
  products: Product[];
}

/** A user in the system. */
export interface User {
  id: number;
  name: string;
  email: string;
}

/** An order placed by a user. */
export interface Order {
  id: number;
  userId: number;
  createdAt: Date;
  status: OrderStatus;
}

/** A product available for purchase. */
export interface Product {
  id: number;
  name: string;
  price: number;
}
