<script lang="ts">
import { defineComponent, h, type PropType, type VNodeChild } from 'vue';
import type { DetailNode } from './detailNode';

export default defineComponent({
  name: 'DetailNode',
  props: {
    node: {
      type: Object as PropType<DetailNode>,
      required: true
    }
  },
  setup(props) {
    const renderNode = (node: DetailNode): VNodeChild => {
      if (node.kind === 'text') return node.text;
      return h(node.tag, node.attrs, node.children.map(renderNode));
    };

    return () => renderNode(props.node);
  }
});
</script>
