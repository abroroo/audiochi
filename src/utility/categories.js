// ESC-50 groups its 50 classes into 5 categories of 10 consecutive classes each.
export const CATEGORY_COLORS = ["#f59e0b", "#38bdf8", "#f472b6", "#a3e635", "#c084fc"];
export const categoryColor = (classIndex) => CATEGORY_COLORS[Math.floor(classIndex / 10)] ?? "#fb923c";
