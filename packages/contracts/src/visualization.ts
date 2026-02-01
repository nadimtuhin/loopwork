/**
 * Visualization Contracts
 *
 * Contracts for graph visualization and dependency tracking visualization.
 */

/**
 * Represents a node in a graph
 */
export interface GraphNode {
  id: string
  label: string
  type?: string
  metadata?: Record<string, unknown>
  style?: Record<string, string | number>
}

/**
 * Represents an edge in a graph
 */
export interface GraphEdge {
  source: string
  target: string
  label?: string
  type?: string
  metadata?: Record<string, unknown>
  style?: Record<string, string | number>
}

/**
 * Represents a graph structure
 */
export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
  direction?: 'TD' | 'LR' | 'TB' | 'RL'
  title?: string
  metadata?: Record<string, unknown>
}

/**
 * Configuration for graph rendering
 */
export interface RenderOptions {
  format?: 'mermaid' | 'dot' | 'json' | 'svg'
  direction?: 'TD' | 'LR' | 'TB' | 'RL'
  theme?: string
  excludeNodes?: string[]
  excludeTypes?: string[]
  grouping?: boolean
  [key: string]: unknown
}

/**
 * Contract for rendering graphs to different formats
 */
export interface IGraphRenderer {
  /**
   * Render a graph to a string representation (e.g., Mermaid syntax, DOT, SVG string)
   * @param graph The graph data to render
   * @param options Rendering options
   */
  render(graph: GraphData, options?: RenderOptions): Promise<string>
  
  /**
   * Check if the renderer supports the specific format
   * @param format The output format to check
   */
  supportsFormat(format: string): boolean
}

/**
 * Context for dependency visualization
 */
export interface DependencyContext {
  /** The root item ID to start visualization from */
  rootId?: string
  
  /** Maximum depth to traverse */
  depth?: number
  
  /** Types of dependencies to include */
  includeTypes?: string[]
  
  /** Types of dependencies to exclude */
  excludeTypes?: string[]
  
  /** Whether to include indirect/transitive dependencies */
  transitive?: boolean
}

/**
 * Contract for visualizing dependencies
 */
export interface IDependencyVisualizer {
  /**
   * Generate a visualization of dependencies
   * @param context Context defining the scope of dependencies
   * @param options Rendering options for the output
   */
  visualize(context: DependencyContext, options?: RenderOptions): Promise<string>
  
  /**
   * Get the underlying graph data structure for custom processing
   * @param context Context defining the scope of dependencies
   */
  getGraphData(context: DependencyContext): Promise<GraphData>
}
