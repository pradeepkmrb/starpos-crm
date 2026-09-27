import { useCallback, useState } from "react";
import { Alert, Linking, Platform, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "@/components/AppText";
import { router, Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { quoteTotals, type QuotationStatus } from "@digitel/shared";
import { Badge, Button, Card, ErrorText, GradientCard, Loading } from "@/components/ui";
import { ApiError, getQuotation, updateQuotationStatus, type Quotation } from "@/lib/api";
import { formatDate, formatRupees } from "@/lib/format";
import { QUOTATION_COLORS, quotationLabel, shareQuotation } from "@/lib/quotations";
import { success } from "@/lib/haptics";
import { colors, space } from "@/theme";

/** One quotation: what's in it, where it stands, and what to do next. */
export default function QuotationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [q, setQ] = useState<Quotation | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setQ(await getQuotation(id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load the quotation");
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function setStatus(status: QuotationStatus) {
    if (!q) return;
    setBusy(status);
    try {
      setQ(await updateQuotationStatus(q.id, status));
      success();
      if (status === "accepted") {
        const msg = "The lead is now marked as won.";
        if (Platform.OS === "web") globalThis.alert?.(msg);
        else Alert.alert("Accepted", msg);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't update");
    } finally {
      setBusy(null);
    }
  }

  async function send() {
    if (!q) return;
    setBusy("send");
    setQ(await shareQuotation(q));
    setBusy(null);
  }

  if (!q) {
    return (
      <View style={{ flex: 1 }}>
        <Stack.Screen options={{ title: "Quotation" }} />
        <ErrorText text={error} />
        {!error && <Loading />}
      </View>
    );
  }

  const totals = quoteTotals(q.items, q.discountPaise);
  const look = QUOTATION_COLORS[q.status];
  const paidShare = q.totalPaise ? Math.min(1, q.paidPaise / q.totalPaise) : 0;

  return (
    <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xl }}>
      <Stack.Screen options={{ title: q.number }} />

      <GradientCard>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroLabel}>{q.lead.company || q.lead.name}</Text>
            <Text style={styles.heroValue}>{formatRupees(q.totalPaise)}</Text>
            <Text style={styles.heroLabel}>
              {formatDate(q.createdAt)}
              {q.validUntil ? ` · valid till ${formatDate(q.validUntil)}` : ""}
            </Text>
          </View>
          <Badge label={quotationLabel(q.status)} fg={look.fg} bg={look.bg} />
        </View>
        {q.status === "accepted" && (
          <View style={{ marginTop: space.lg }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={styles.heroLabel}>Collected {formatRupees(q.paidPaise)}</Text>
              <Text style={styles.heroLabel}>{q.balancePaise > 0 ? `${formatRupees(q.balancePaise)} due` : "Fully paid"}</Text>
            </View>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${Math.max(2, paidShare * 100)}%` }]} />
            </View>
          </View>
        )}
      </GradientCard>

      <Card style={{ marginTop: space.lg, paddingVertical: space.sm }}>
        {q.items.map((item, i) => (
          <View key={item.id} style={[styles.line, i > 0 && styles.divider]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={styles.itemMeta}>
                {item.quantity} × {formatRupees(item.unitPricePaise)} · GST {item.taxPercent}%
              </Text>
            </View>
            <Text style={styles.amount}>{formatRupees(totals.lineAmountsPaise[i])}</Text>
          </View>
        ))}
        <View style={[styles.divider, { paddingTop: space.md, gap: 6 }]}>
          <Row label="Subtotal" value={formatRupees(q.subtotalPaise)} />
          {q.discountPaise > 0 && <Row label="Discount" value={`− ${formatRupees(q.discountPaise)}`} />}
          {totals.taxByRate.map((t) => (
            <Row key={t.taxPercent} label={`GST (${t.taxPercent}%)`} value={formatRupees(t.taxPaise)} />
          ))}
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6, paddingBottom: space.sm }}>
            <Text style={styles.grandLabel}>Grand total</Text>
            <Text style={styles.grandValue}>{formatRupees(q.totalPaise)}</Text>
          </View>
        </View>
      </Card>

      {q.notes ? (
        <Card style={{ marginTop: space.md }}>
          <Text style={styles.itemMeta}>Notes</Text>
          <Text style={{ color: colors.text, marginTop: 4 }}>{q.notes}</Text>
        </Card>
      ) : null}

      <ErrorText text={error} />

      <View style={{ gap: space.sm, marginTop: space.lg }}>
        {q.status !== "rejected" && (
          <Button title={q.status === "draft" ? "Send on WhatsApp" : "Send again"} loading={busy === "send"} disabled={!!busy} onPress={() => void send()} />
        )}
        {q.status === "accepted" && q.balancePaise > 0 && (
          <Button title="Record payment" onPress={() => router.push(`/payment/new?leadId=${q.leadId}&quotationId=${q.id}`)} />
        )}
        <Button title="Open PDF" variant="secondary" onPress={() => void Linking.openURL(q.pdfUrl)} />
        {(q.status === "draft" || q.status === "sent") && (
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <Button title="Mark accepted" variant="secondary" loading={busy === "accepted"} disabled={!!busy} onPress={() => void setStatus("accepted")} style={{ flex: 1 }} />
            {q.status === "sent" && (
              <Button title="Rejected" variant="secondary" loading={busy === "rejected"} disabled={!!busy} onPress={() => void setStatus("rejected")} style={{ flex: 1 }} />
            )}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <Text style={{ color: colors.muted }}>{label}</Text>
      <Text style={{ color: colors.ink, fontWeight: "600" }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  heroLabel: { color: "#D1FAE5", fontSize: 13 },
  heroValue: { color: "#fff", fontSize: 32, fontWeight: "800", marginVertical: 4, letterSpacing: -0.5 },
  track: { height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.25)", marginTop: 6, overflow: "hidden" },
  fill: { height: 8, borderRadius: 4, backgroundColor: "#fff" },
  line: { flexDirection: "row", alignItems: "center", paddingVertical: space.md, gap: space.md },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  itemName: { fontSize: 15, fontWeight: "700", color: colors.ink },
  itemMeta: { fontSize: 13, color: colors.muted, marginTop: 2 },
  amount: { fontSize: 15, fontWeight: "700", color: colors.ink },
  grandLabel: { fontSize: 16, fontWeight: "800", color: colors.ink },
  grandValue: { fontSize: 20, fontWeight: "800", color: colors.brandDark },
});
