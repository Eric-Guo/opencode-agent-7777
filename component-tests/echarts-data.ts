export const lineOptions = {
  color: ["#5470c6", "#91cc75", "#fac858"],
  backgroundColor: "#ffffff",
  title: {
    text: "Weekly Active Users",
    subtext: "Sample line chart for renderer testing",
    left: "center",
    textStyle: { fontSize: 18 },
  },
  tooltip: { trigger: "axis", axisPointer: { type: "cross" } },
  legend: { bottom: 0 },
  grid: { left: 48, right: 32, top: 72, bottom: 56 },
  xAxis: { type: "category", boundaryGap: false, data: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] },
  yAxis: { type: "value", name: "Users", min: 0, max: 40 },
  series: [
    {
      name: "DAU",
      type: "line",
      smooth: true,
      symbol: "circle",
      symbolSize: 8,
      data: [12, 20, 15, 32, 30, 22, 18],
      lineStyle: { width: 3 },
      areaStyle: { opacity: 0.12 },
      markPoint: { data: [{ coord: ["Thu", 32], value: "Peak" }] },
      markLine: { data: [{ yAxis: 25, name: "Target" }] },
    },
    {
      name: "MAU",
      type: "line",
      smooth: true,
      data: [22, 25, 24, 28, 34, 30, 26],
      lineStyle: { width: 2, type: "dashed" },
    },
  ],
  animationDuration: 600,
  animationEasing: "cubicOut",
}

export const lineSource = JSON.stringify(lineOptions, null, 2)
export const pieSource = JSON.stringify({
  title: { text: "Pie replacement" },
  series: [
    {
      type: "pie",
      data: [
        { name: "Alpha", value: 2 },
        { name: "Beta", value: 3 },
      ],
    },
  ],
})
export const fence = (source: string, language = "echarts") => `\`\`\`${language}\n${source}\n\`\`\``
