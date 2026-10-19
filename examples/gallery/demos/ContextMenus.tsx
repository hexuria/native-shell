import { Input, signal, Text, View } from "nsh";
import { Platform } from "nsh/device";
import { Menu } from "nsh/desktop";
import { ActionSheet } from "nsh/ui/mobile";
import { Badge, Card, colors, mono, radius } from "../ui";

/** Real menus with nested targets and visible event counts. */
export function ContextMenus() {
  const requests = signal(0);
  const presses = signal(0);
  const source = signal("None");
  const selection = signal("None");
  const open = signal(false);
  const show = async (target: string) => {
    requests.update((n) => n + 1);
    source.set(target);
    open.set(true);
    selection.set("Waiting");
    const choose = (action: string) => selection.set(action);
    try {
      if (Platform.isDesktop && Platform.OS !== "web") {
        await Menu.popup([
          { label: `Inspect ${target.toLowerCase()}`, onSelect: () => choose("Inspect") },
          { label: "Mark as favorite", onSelect: () => choose("Favorite") },
        ]);
      } else {
        const index = await ActionSheet.show({
          title: `${target} menu`,
          options: ["Cancel", "Inspect", "Mark as favorite"],
          cancelButtonIndex: 0,
        });
        if (index > 0) choose(index === 1 ? "Inspect" : "Favorite");
      }
      if (selection() === "Waiting") selection.set("Dismissed");
    } finally {
      open.set(false);
    }
  };
  const targetStyle = () => ({
    padding: 16,
    gap: 12,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.raised,
  });
  return (
    <Card icon="gestures" title="Context menus" subtitle="Right-click or long-press a target" right={<Badge label={open() ? "Open" : "Ready"} />}>
      <View testID="context-parent" onContextMenu={() => show("Parent")} onPress={() => presses.update((n) => n + 1)} style={targetStyle()}>
        <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600" }}>Parent target</Text>
        <View testID="context-child" onContextMenu={() => show("Child")} onPress={() => presses.update((n) => n + 1)} style={targetStyle()}>
          <Text style={{ color: colors.accent, fontSize: 14 }}>Child target · its own menu</Text>
        </View>
        <View testID="context-fallback" style={{ padding: 12 }}>
          <Text style={{ color: colors.muted, fontSize: 13 }}>This area opens the parent menu</Text>
        </View>
        <Input testID="context-editor" defaultValue="Edit this text to try its editing menu" style={{ height: 40, color: colors.text, backgroundColor: colors.inset, borderRadius: radius.control, paddingHorizontal: 10 }} />
      </View>
      <View testID="context-disabled" disabled onContextMenu={() => show("Disabled")} style={{ ...targetStyle(), opacity: 0.45 }}>
        <Text style={{ color: colors.muted, fontSize: 14 }}>Disabled target</Text>
      </View>
      <Text testID="context-status" style={{ color: colors.text, fontSize: 12, fontFamily: mono }}>
        {`Requests: ${requests()} · Target: ${source()} · Selection: ${selection()} · Presses: ${presses()}`}
      </Text>
      <Text style={{ color: colors.muted, fontSize: 12 }}>One menu request per gesture. Long-pressing leaves the press count unchanged. On macOS, try Control-click too.</Text>
    </Card>
  );
}
