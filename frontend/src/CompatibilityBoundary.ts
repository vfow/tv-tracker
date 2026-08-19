import { defineComponent, h } from "vue";

export default defineComponent({
  name: "TVTrackerCompatibilityBoundary",
  setup() {
    return () =>
      h("span", {
        "data-tv-modern-boundary": "ready",
        hidden: true
      });
  }
});
