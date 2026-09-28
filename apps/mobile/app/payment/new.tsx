import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Text } from "@/components/AppText";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { PAYMENT_MODES, PAYMENT_MODE_LABELS, type PaymentMode } from "@starpos-crm/shared";
import { DateTimeField } from "@/components/DateTimeField";
import { Button, Card, Chip, ChipRow, ErrorText, Field, Input } from "@/components/ui";
import { ApiError, createPayment, listQuotations, type Quotation } from "@/lib/api";
import { formatRupees } from "@/lib/format";
import { success } from "@/lib/haptics";
import { colors, space } from "@/theme";

/** Record money received (mockup screen 14), optionally against an accepted quotation. */
export default function NewPaymentScreen() {
  const params = useLocalSearchParams<{ leadId: string; quotationId?: string }>();
  const [quotes, setQuotes] = useState<Quotation[]>([]);
  const [quotationId, setQuotationId] = useState<string | null>(params.quotationId ?? null);
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<PaymentMode>("upi");
  const [reference, setReference] = useState("");
  const [receivedAt, setReceivedAt] = useState<Date>(new Date());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listQuotations({ leadId: params.leadId, status: "accepted" })
      .then((qs) => {
        setQuotes(qs);
        const preset = qs.find((q) => q.id === params.quotationId) ?? (qs.length === 1 ? qs[0] : undefined);
        if (preset) {
          setQuotationId(preset.id);
          if (preset.balancePaise > 0) setAmount((a) => a || String(preset.balancePaise / 100));
        }
      })
      .catch(() => setQuotes([]));
  }, [params.leadId, params.quotationId]);

  const quote = quotes.find((q) => q.id === quotationId);

  async function save() {
    const value = Number(amount.replace(/[,\s₹]/g, ""));
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter the amount received.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createPayment({
        leadId: params.leadId,
        ...(quotationId ? { quotationId } : {}),
        amountPaise: Math.round(value * 100),
        mode,
        ...(reference.trim() ? { reference: reference.trim() } : {}),
        receivedAt: receivedAt.toISOString(),
      });
      success();
      router.back();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't record the payment");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xl }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: "Record payment" }} />
      <Card>
        <Text style={styles.amountLabel}>Amount received</Text>
        <View style={styles.amountRow}>
          <Text style={styles.rupee}>₹</Text>
          <Input
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="0"
            style={styles.amountInput}
            autoFocus={!params.quotationId}
          />
        </View>
        {quote && quote.balancePaise > 0 ? (
          <Text style={styles.hint}>
            {formatRupees(quote.balancePaise)} still due on {quote.number}
          </Text>
        ) : null}
      </Card>

      <Card style={{ marginTop: space.md }}>
        <Field label="Mode">
          <ChipRow>
            {PAYMENT_MODES.map((m) => (
              <Chip key={m} label={PAYMENT_MODE_LABELS[m]} active={mode === m} onPress={() => setMode(m)} />
            ))}
          </ChipRow>
        </Field>
        {quotes.length > 0 && (
          <Field label="Against quotation">
            <ChipRow>
              <Chip label="None" active={!quotationId} onPress={() => setQuotationId(null)} />
              {quotes.map((q) => (
                <Chip key={q.id} label={`${q.number} · ${formatRupees(q.totalPaise)}`} active={quotationId === q.id} onPress={() => setQuotationId(q.id)} />
              ))}
            </ChipRow>
          </Field>
        )}
        <Field label="Reference">
          <Input
            value={reference}
            onChangeText={setReference}
            placeholder={mode === "cheque" ? "Cheque number" : mode === "upi" ? "UPI transaction ID" : "Optional"}
          />
        </Field>
        <Field label="Received on">
          <DateTimeField value={receivedAt} onChange={setReceivedAt} mode="date" />
        </Field>
      </Card>

      <ErrorText text={error} />
      <Button title="Save payment" loading={busy} onPress={() => void save()} style={{ marginTop: space.lg }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  amountLabel: { fontSize: 13, fontWeight: "600", color: colors.muted },
  amountRow: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.sm },
  rupee: { fontSize: 30, fontWeight: "800", color: colors.brandDark },
  amountInput: { flex: 1, fontSize: 28, fontWeight: "800", color: colors.ink, borderWidth: 0, backgroundColor: "transparent", paddingHorizontal: 0 },
  hint: { fontSize: 13, color: colors.warning, marginTop: space.sm, fontWeight: "600" },
});
