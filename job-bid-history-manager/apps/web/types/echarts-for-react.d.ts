declare module "echarts-for-react" {
  import type { ComponentType, Ref } from "react";

  export interface ReactEChartsProps {
    option: object;
    style?: React.CSSProperties;
    notMerge?: boolean;
    lazyUpdate?: boolean;
    replaceMerge?: string | string[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onEvents?: Record<string, (params: any) => void>;
    onChartReady?: (instance: import("echarts").EChartsType) => void;
  }

  const ReactECharts: ComponentType<ReactEChartsProps & { ref?: Ref<unknown> }>;
  export default ReactECharts;
}
