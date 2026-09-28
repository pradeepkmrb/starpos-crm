import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "@/components/AppText";
import { Ionicons } from "@expo/vector-icons";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { quoteTotals } from "@starpos-crm/shared";
import { Button, Card, EmptyState, ErrorText, Field, Input, Loading } from "@/components/ui";
import { ApiError, createQuotation, getLead, listProducts, type Lead, type Product } from "@/lib/api";
import { formatRupees } from "@/lib/format";
import { shareQuotation } from "@/lib/quotations";
import { success, tap } from "@/lib/haptics";
import { colors, radius, space } from "@/theme";

interface CustomLine {
  name: string;
  price: string;
  quantity: number;
}

const toPaise = (rupees: string) => {
  const n = Number(rupees.replace(/[,\s₹]/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0;
};

/**
 * New quotation (mockup screen 12): tap products to add them, adjust
 * quantities, add a discount, and watch the GST total update. "Create & send"
 * delivers the PDF on WhatsApp, or falls back to sharing it by hand.
 */
export default function NewQuotationScreen() {
  const params = useLocalSearchParams<{ leadId?: string | string[] }>();
  const leadId = Array.isArray(params.leadId) ? params.leadId[0] : params.leadId;
  const [lead, setLead] = useState<Lead | null>(null);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [custom, setCustom] = useState<CustomLine | null>(null);
  const [discount, setDiscount] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState<"draft" | "send" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!leadId) {
      setProducts([]);
      setError("Choose a lead before creating a quotation.");
      return;
    }

    // The catalogue is helpful, but it must not prevent a rep from creating a
    // quotation with a custom item when the catalogue request is unavailable.
    getLead(leadId)
      .then(setLead)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load this lead"));
    listProducts()
      .then(setProducts)
      .catch(() => setProducts([]));
  }, [leadId]);

  const chosen = (products ?? []).filter((p) => (qty[p.id] ?? 0) > 0);
  const lines = [
    ...chosen.map((p) => ({ quantity: qty[p.id], unitPricePaise: Math.round(p.price * 100), taxPercent: p.taxPercent })),
    ...(custom && custom.name.trim() && toPaise(custom.price) > 0
      ? [{ quantity: custom.quantity, unitPricePaise: toPaise(custom.price), taxPercent: 18 }]
      : []),
  ];
  const totals = useMemo(() => quoteTotals(lines, toPaise(discount)), [JSON.stringify(lines), discount]);

  function bump(id: string, delta: number) {
    tap();
    setQty((q) => ({ ...q, [id]: Math.max(0, (q[id] ?? 0) + delta) }));
  }

  async function save(send: boolean) {
    if (!leadId || !lead) {
      setError("Choose a valid lead before creating a quotation.");
      return;
    }
    if (lines.length === 0) {
      setError("Add at least one item.");
      return;
    }
    setBusy(send ? "send" : "draft");
    setError(null);
    try {
      const quotation = await createQuotation({
        leadId,
        items: [
          ...chosen.map((p) => ({ productId: p.id, quantity: qty[p.id] })),
          ...(custom && custom.name.trim() && toPaise(custom.price) > 0
            ? [{ name: custom.name.trim(), quantity: custom.quantity, unitPricePaise: toPaise(custom.price), taxPercent: 18 }]
            : []),
        ],
        discountPaise: toPaise(discount),
        notes: notes.trim() || null,
      });
      success();
      if (send) await shareQuotation(quotation);
      router.replace(`/quotation/${quotation.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create the quotation");
    } finally {
      setBusy(null);
    }
  }

  if (!products) {
    return (
      <View style={{ flex: 1 }}>
        <Stack.Screen options={{ title: "New quotation" }} />
        <ErrorText text={error} />
        {!error && <Loading />}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: "New quotation" }} />
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: 200 }} keyboardShouldPersistTaps="handled">
        {lead && (
          <Text style={styles.forText}>
            For <Text style={{ fontWeight: "800", color: colors.ink }}>{lead.company || lead.name}</Text>
          </Text>
        )}

        <Text style={styles.section}>Products</Text>
        <Card style={{ paddingVertical: 0 }}>
          {products.length === 0 ? (
            <EmptyState text="Your catalogue is empty — add a custom item below, or add products on the web dashboard." />
          ) : (
            products.map((p, i) => {
              const n = qty[p.id] ?? 0;
              return (
                <View key={p.id} style={[styles.product, i > 0 && styles.divider]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.productName}>{p.name}</Text>
                    <Text style={styles.productMeta}>
                      {formatRupees(Math.round(p.price * 100))} · GST {p.taxPercent}%
                    </Text>
                  </View>
                  {n === 0 ? (
                    <Pressable onPress={() => bump(p.id, 1)} style={styles.addButton} hitSlop={6}>
                      <Text style={styles.addText}>Add</Text>
                    </Pressable>
                  ) : (
                    <View style={styles.stepper}>
                      <Pressable onPress={() => bump(p.id, -1)} hitSlop={6} style={styles.stepButton}>
                        <Ionicons name="remove" size={18} color={colors.brandDark} />
                      </Pressable>
                      <Text style={styles.stepValue}>{n}</Text>
                      <Pressable onPress={() => bump(p.id, 1)} hitSlop={6} style={styles.stepButton}>
                        <Ionicons name="add" size={18} color={colors.brandDark} />
                      </Pressable>
                    </View>
                  )}
                </View>
              );
            })
          )}
        </Card>

        {custom ? (
          <Card style={{ marginTop: space.md }}>
            <Field label="Custom item">
              <Input value={custom.name} placeholder="e.g. Installation" onChangeText={(name) => setCustom({ ...custom, name })} />
            </Field>
            <View style={{ flexDirection: "row", gap: space.md }}>
              <View style={{ flex: 1 }}>
                <Field label="Price (₹, before GST 18%)">
                  <Input value={custom.price} keyboardType="decimal-pad" onChangeText={(price) => setCustom({ ...custom, price })} />
                </Field>
              </View>
              <View style={{ width: 90 }}>
                <Field label="Qty">
                  <Input
                    value={String(custom.quantity)}
                    keyboardType="number-pad"
                    onChangeText={(t) => setCustom({ ...custom, quantity: Math.max(1, parseInt(t, 10) || 1) })}
                  />
                </Field>
              </View>
            </View>
            <Pressable onPress={() => setCustom(null)}>
              <Text style={{ color: colors.danger, fontWeight: "600" }}>Remove custom item</Text>
            </Pressable>
          </Card>
        ) : (
          <Pressable onPress={() => setCustom({ name: "", price: "", quantity: 1 })} style={styles.customLink}>
            <Ionicons name="add-circle-outline" size={18} color={colors.brand} />
            <Text style={styles.customText}>Add a custom item</Text>
          </Pressable>
        )}

        <Card style={{ marginTop: space.md }}>
          <Field label="Discount (₹)">
            <Input value={discount} keyboardType="decimal-pad" placeholder="0" onChangeText={setDiscount} />
          </Field>
          <Field label="Notes for the customer">
            <Input value={notes} multiline placeholder="Delivery timeline, what's included…" onChangeText={setNotes} />
          </Field>
        </Card>
        <ErrorText text={error} />
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.totalsRow}>
          <Text style={styles.totalsMuted}>Subtotal {formatRupees(totals.subtotalPaise)}</Text>
          <Text style={styles.totalsMuted}>
            {totals.discountPaise > 0 ? `− ${formatRupees(totals.discountPaise)} · ` : ""}GST {formatRupees(totals.taxPaise)}
          </Text>
        </View>
        <View style={[styles.totalsRow, { marginTop: 4 }]}>
          <Text style={styles.totalLabel}>Grand total</Text>
          <Text style={styles.totalValue}>{formatRupees(totals.totalPaise)}</Text>
        </View>
        <View style={{ flexDirection: "row", gap: space.sm, marginTop: space.md }}>
          <Button title="Save draft" variant="secondary" loading={busy === "draft"} disabled={!!busy} onPress={() => void save(false)} style={{ flex: 1 }} />
          <Button title="Create & send" loading={busy === "send"} disabled={!!busy} onPress={() => void save(true)} style={{ flex: 1.4 }} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  forText: { fontSize: 15, color: colors.muted, marginBottom: space.md },
  section: { fontSize: 13, fontWeight: "700", color: colors.muted, marginBottom: space.sm, textTransform: "uppercase", letterSpacing: 0.5 },
  product: { flexDirection: "row", alignItems: "center", paddingVertical: space.md, gap: space.md },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  productName: { fontSize: 15, fontWeight: "700", color: colors.ink },
  productMeta: { fontSize: 13, color: colors.muted, marginTop: 2 },
  addButton: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.brand },
  addText: { color: colors.brand, fontWeight: "700" },
  stepper: { flexDirection: "row", alignItems: "center", backgroundColor: colors.brandSoft, borderRadius: radius.pill, padding: 4 },
  stepButton: { width: 30, height: 30, borderRadius: 15, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  stepValue: { minWidth: 32, textAlign: "center", fontSize: 16, fontWeight: "800", color: colors.brandDeep },
  customLink: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: space.md },
  customText: { color: colors.brand, fontWeight: "700" },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: space.lg,
    paddingBottom: space.xl,
    shadowColor: "#0F172A",
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  totalsRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  totalsMuted: { fontSize: 13, color: colors.muted },
  totalLabel: { fontSize: 16, fontWeight: "700", color: colors.ink },
  totalValue: { fontSize: 26, fontWeight: "800", color: colors.brandDark },
});
