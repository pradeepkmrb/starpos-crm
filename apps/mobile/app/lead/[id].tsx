import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "@/components/AppText";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LEAD_STATUSES, LEAD_STATUS_LABELS, PAYMENT_MODE_LABELS, type LeadStatus } from "@starpos-crm/shared";
import { ActivityRow } from "@/components/ActivityRow";
import { Badge, Button, Card, Chip, ChipRow, EmptyState, ErrorText, IconChip, Loading } from "@/components/ui";
import {
  ApiError,
  getLead,
  listActivities,
  listLeadFields,
  listPayments,
  listQuotations,
  mediaUrl,
  updateLead,
  type Activity,
  type CustomFieldDefinition,
  type Lead,
  type Payment,
  type Quotation,
} from "@/lib/api";
import { QUOTATION_COLORS, quotationLabel } from "@/lib/quotations";
import { formatDate, formatRupees, openDialer, openMaps, openWhatsApp } from "@/lib/format";
import { tap } from "@/lib/haptics";
import { choosePhoto, PhotoError } from "@/lib/photos";
import { brandShadow, colors, heroGradient, radius, shadow, space, STAGE_COLORS } from "@/theme";

type Tab = "info" | "activities" | "followups" | "deals";

const HERO_HEIGHT = 230;

/** Lead details (mockup screen 4): photo header, quick actions, tabs. */
export default function LeadDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [lead, setLead] = useState<Lead | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [fields, setFields] = useState<CustomFieldDefinition[]>([]);
  const [quotes, setQuotes] = useState<Quotation[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [tab, setTab] = useState<Tab>("info");
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [savingStage, setSavingStage] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    try {
      const [leadRes, activityRes, fieldRes, quoteRes, paymentRes] = await Promise.all([
        getLead(id),
        listActivities({ leadId: id }),
        listLeadFields().catch(() => [] as CustomFieldDefinition[]),
        listQuotations({ leadId: id }).catch(() => [] as Quotation[]),
        listPayments(id).catch(() => [] as Payment[]),
      ]);
      setLead(leadRes);
      setActivities(activityRes);
      setFields(fieldRes);
      setQuotes(quoteRes);
      setPayments(paymentRes);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load this lead");
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  function showProblem(title: string, message: string) {
    if (Platform.OS === "web") setError(message);
    else Alert.alert(title, message);
  }

  async function changeStage(status: LeadStatus) {
    if (!lead || status === lead.status) return;
    setSavingStage(true);
    try {
      setLead(await updateLead(lead.id, { status }));
      tap();
    } catch (err) {
      showProblem("Couldn't update", err instanceof ApiError ? err.message : "Could not change the stage");
    } finally {
      setSavingStage(false);
    }
  }

  async function changePhoto() {
    if (!lead) return;
    try {
      const picked = await choosePhoto({
        aspect: [16, 10],
        canRemove: !!lead.imageUrl,
        title: "Lead photo",
        onUploadStart: () => setUploading(true),
      });
      if (picked === undefined) return;
      setUploading(true);
      setLead(await updateLead(lead.id, { imageUrl: picked }));
    } catch (err) {
      showProblem("Photo not saved", err instanceof PhotoError || err instanceof ApiError ? err.message : "Couldn't update the photo");
    } finally {
      setUploading(false);
    }
  }

  /**
   * Opens the dialer and queues up the call log for when the rep comes back;
   * the log screen estimates the call's length from the time spent away.
   */
  function callLead() {
    if (!lead?.phone) return;
    router.push(`/activity/new?leadId=${lead.id}&type=call&callStartedAt=${Date.now()}`);
    void openDialer(lead.phone);
  }

  const openVisit = activities.find((a) => a.status === "in_progress");
  function visitLead() {
    if (!lead) return;
    router.push(openVisit ? `/visit/${openVisit.id}` : `/visit/check-in?leadId=${lead.id}`);
  }

  if (!lead) {
    return (
      <View style={{ flex: 1 }}>
        <Stack.Screen options={{ title: "Lead" }} />
        <ErrorText text={error} />
        {!error && <Loading />}
      </View>
    );
  }

  const answers = Object.entries(lead.customFieldsJson ?? {}).filter(([, v]) => v !== "" && v !== null);
  const labelFor = (key: string) => fields.find((f) => f.key === key)?.label ?? key;
  const photo = mediaUrl(lead.imageUrl);
  const followUps = activities.filter((a) => a.status === "scheduled");
  const history = activities.filter((a) => a.status !== "scheduled");
  const stage = STAGE_COLORS[lead.status];
  const subtitle = [lead.company && lead.company !== lead.name ? lead.name : null, lead.address].filter(Boolean).join(" · ");

  const activityRow = (activity: Activity) => (
    <ActivityRow
      key={activity.id}
      activity={activity}
      showLead={false}
      onPress={
        activity.status === "in_progress"
          ? () => router.push(`/visit/${activity.id}`)
          : activity.status === "scheduled"
            ? () =>
                router.push(
                  activity.type === "visit"
                    ? `/visit/check-in?leadId=${lead.id}&activityId=${activity.id}`
                    : `/activity/new?leadId=${lead.id}&type=${activity.type}&completes=${activity.id}`,
                )
            : undefined
      }
    />
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* The photo runs under a see-through header, as in the mockup. */}
      <Stack.Screen
        options={{
          title: "",
          headerTransparent: true,
          headerTintColor: "#fff",
          headerStyle: { backgroundColor: "transparent" },
          headerRight: () => (
            <Pressable onPress={() => router.push(`/lead/edit?id=${lead.id}`)} hitSlop={10} style={styles.headerPill}>
              <Ionicons name="create-outline" size={16} color="#fff" />
              <Text style={styles.headerPillText}>Edit</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView
        contentContainerStyle={{ paddingBottom: 96 + insets.bottom }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            progressViewOffset={insets.top + 40}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
      >
        <Pressable onPress={() => void changePhoto()} disabled={uploading} accessibilityLabel="Change lead photo">
          {photo ? (
            <Image source={{ uri: photo }} style={styles.hero} />
          ) : (
            <LinearGradient colors={heroGradient} style={[styles.hero, styles.heroEmpty]}>
              <Ionicons name="storefront-outline" size={44} color="rgba(255,255,255,0.9)" />
              <Text style={styles.heroEmptyText}>Tap to add a photo</Text>
            </LinearGradient>
          )}
          {/* Keeps the white back arrow readable on bright photos. */}
          <LinearGradient colors={["rgba(15,23,42,0.55)", "transparent"]} style={styles.heroShade} pointerEvents="none" />
          <View style={styles.cameraButton}>
            {uploading ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="camera" size={18} color="#fff" />}
          </View>
          {lead.isHot && (
            <View style={styles.hotTag}>
              <Ionicons name="flame" size={13} color="#fff" />
              <Text style={styles.hotTagText}>Hot Lead</Text>
            </View>
          )}
        </Pressable>

        <View style={styles.sheet}>
          <Text style={styles.name}>{lead.company || lead.name}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          <View style={{ flexDirection: "row", gap: space.xs, marginTop: space.sm, flexWrap: "wrap" }}>
            <Badge label={LEAD_STATUS_LABELS[lead.status]} fg={stage.fg} bg={stage.bg} />
            {lead.valuePaise ? <Badge label={formatRupees(lead.valuePaise)} fg={colors.greenDark} bg={colors.greenSoft} /> : null}
          </View>

          <View style={styles.actions}>
            <Action icon="call" label="Call" color={colors.brand} disabled={!lead.phone} onPress={callLead} />
            <Action icon="logo-whatsapp" label="WhatsApp" color="#16A34A" disabled={!lead.phone} onPress={() => void openWhatsApp(lead.phone!)} />
            <Action
              icon="navigate"
              label="Location"
              color={colors.info}
              disabled={!lead.address && lead.latitude === null}
              onPress={() => void openMaps(lead)}
            />
            <Action
              icon={openVisit ? "radio-button-on" : "log-in-outline"}
              label={openVisit ? "On visit" : "Check in"}
              color={colors.warning}
              onPress={visitLead}
            />
            <Action icon="ellipsis-horizontal" label="More" color={colors.muted} onPress={() => router.push(`/lead/edit?id=${lead.id}`)} />
          </View>

          <View style={styles.tabs}>
            <TabButton label="Info" active={tab === "info"} onPress={() => setTab("info")} />
            <TabButton label="Activities" count={history.length} active={tab === "activities"} onPress={() => setTab("activities")} />
            <TabButton label="Follow-ups" count={followUps.length} active={tab === "followups"} onPress={() => setTab("followups")} />
            <TabButton label="Deals" count={quotes.length} active={tab === "deals"} onPress={() => setTab("deals")} />
          </View>
        </View>

        <View style={{ paddingHorizontal: space.lg }}>
          <ErrorText text={error} />

          {tab === "deals" ? (
            <Deals lead={lead} quotes={quotes} payments={payments} />
          ) : tab === "info" ? (
            <>
              <Card style={{ marginTop: space.md, gap: space.lg }}>
                <InfoRow icon="person-outline" label="Contact person" value={lead.name} />
                <InfoRow
                  icon="call-outline"
                  label="Mobile"
                  value={lead.phone}
                  accent={colors.brand}
                  action={lead.phone ? { icon: "call", onPress: callLead } : undefined}
                />
                <InfoRow icon="mail-outline" label="Email" value={lead.email} accent={colors.info} />
                <InfoRow
                  icon="location-outline"
                  label="Address"
                  value={lead.address}
                  action={lead.address || lead.latitude !== null ? { icon: "navigate", onPress: () => void openMaps(lead) } : undefined}
                  link={lead.address || lead.latitude !== null ? { label: "View on Map", onPress: () => void openMaps(lead) } : undefined}
                />
              </Card>

              <Card style={{ marginTop: space.md }}>
                <Text style={styles.sectionLabel}>Stage</Text>
                <ChipRow>
                  {LEAD_STATUSES.map((status) => (
                    <Chip
                      key={status}
                      label={LEAD_STATUS_LABELS[status]}
                      active={lead.status === status}
                      onPress={() => (savingStage ? undefined : void changeStage(status))}
                    />
                  ))}
                </ChipRow>
              </Card>

              <Card style={{ marginTop: space.md, gap: space.lg }}>
                <InfoRow icon="megaphone-outline" label="Lead source" value={lead.source === "meta_ads" ? "Meta ad" : lead.source} />
                <InfoRow icon="cash-outline" label="Expected value" value={lead.valuePaise ? formatRupees(lead.valuePaise) : null} />
                <InfoRow icon="calendar-outline" label="Expected close" value={lead.expectedCloseAt ? formatDate(lead.expectedCloseAt) : null} />
                <InfoRow icon="person-circle-outline" label="Owner" value={lead.owner ? (lead.owner.name ?? lead.owner.email) : "Unassigned"} />
                {answers.map(([key, value]) => (
                  <InfoRow
                    key={key}
                    icon="list-outline"
                    label={labelFor(key)}
                    value={typeof value === "boolean" ? (value ? "Yes" : "No") : String(value)}
                  />
                ))}
                {lead.notes ? <InfoRow icon="document-text-outline" label="Notes" value={lead.notes} /> : null}
              </Card>
            </>
          ) : tab === "activities" ? (
            <Card style={{ marginTop: space.md, paddingVertical: 0 }}>
              {history.length === 0 ? <EmptyState text="Nothing logged yet." /> : history.map(activityRow)}
            </Card>
          ) : (
            <>
              <Button
                title="Schedule a follow-up"
                variant="secondary"
                onPress={() => router.push(`/activity/new?leadId=${lead.id}&type=follow_up&mode=schedule`)}
                style={{ marginTop: space.md }}
              />
              <Card style={{ marginTop: space.md, paddingVertical: 0 }}>
                {followUps.length === 0 ? <EmptyState text="No follow-ups scheduled." /> : followUps.map(activityRow)}
              </Card>
            </>
          )}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, space.md) }]}>
        <Button title="Add Activity" onPress={() => router.push(`/activity/new?leadId=${lead.id}`)} />
      </View>
    </View>
  );
}

function Deals({ lead, quotes, payments }: { lead: Lead; quotes: Quotation[]; payments: Payment[] }) {
  const collected = payments.reduce((sum, p) => sum + p.amountPaise, 0);
  return (
    <>
      <View style={{ flexDirection: "row", gap: space.sm, marginTop: space.md }}>
        <Button title="New quotation" onPress={() => router.push(`/quotation/new?leadId=${lead.id}`)} style={{ flex: 1 }} />
        <Button
          title="Record payment"
          variant="secondary"
          onPress={() => router.push(`/payment/new?leadId=${lead.id}`)}
          style={{ flex: 1 }}
        />
      </View>
      <Card style={{ marginTop: space.md, paddingVertical: 0 }}>
        {quotes.length === 0 ? (
          <EmptyState text="No quotations yet." />
        ) : (
          quotes.map((q, i) => {
            const look = QUOTATION_COLORS[q.status];
            return (
              <Pressable
                key={q.id}
                onPress={() => router.push(`/quotation/${q.id}`)}
                style={({ pressed }) => [styles.dealRow, i > 0 && styles.dealDivider, pressed && { opacity: 0.7 }]}
              >
                <IconChip name="receipt-outline" fg={colors.brand} bg={colors.brandSoft} size={40} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.dealTitle}>
                    {q.number} <Text style={styles.dealMeta}>· {formatDate(q.createdAt)}</Text>
                  </Text>
                  <View style={{ flexDirection: "row", marginTop: 4 }}>
                    <Badge label={quotationLabel(q.status)} fg={look.fg} bg={look.bg} />
                  </View>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.dealTitle}>{formatRupees(q.totalPaise)}</Text>
                  {q.status === "accepted" ? (
                    <Text style={[styles.dealMeta, { color: q.balancePaise > 0 ? colors.warning : colors.brand, fontWeight: "700" }]}>
                      {q.balancePaise > 0 ? `${formatRupees(q.balancePaise)} due` : "Paid"}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })
        )}
      </Card>
      {payments.length > 0 && (
        <Card style={{ marginTop: space.md }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: space.sm }}>
            <Text style={styles.sectionLabel}>Payments received</Text>
            <Text style={[styles.dealTitle, { color: colors.brandDark }]}>{formatRupees(collected)}</Text>
          </View>
          {payments.map((p) => (
            <View key={p.id} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 }}>
              <Text style={styles.dealMeta}>
                {formatDate(p.receivedAt)} · {PAYMENT_MODE_LABELS[p.mode]}
                {p.quotation ? ` · ${p.quotation.number}` : ""}
              </Text>
              <Text style={{ fontWeight: "700", color: colors.ink }}>{formatRupees(p.amountPaise)}</Text>
            </View>
          ))}
        </Card>
      )}
    </>
  );
}

function Action({
  icon,
  label,
  color,
  onPress,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.action, (pressed || disabled) && { opacity: disabled ? 0.35 : 0.7 }]}
    >
      <View style={[styles.actionIcon, { backgroundColor: `${color}1A` }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

function TabButton({ label, count, active, onPress }: { label: string; count?: number; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.tab, active && styles.tabActive]} accessibilityState={{ selected: active }}>
      <Text style={[styles.tabText, active && { color: colors.brand, fontWeight: "700" }]} numberOfLines={1}>
        {label}
        {count ? ` ${count}` : ""}
      </Text>
    </Pressable>
  );
}

function InfoRow({
  icon,
  label,
  value,
  accent,
  action,
  link,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string | null;
  accent?: string;
  action?: { icon: keyof typeof Ionicons.glyphMap; onPress: () => void };
  link?: { label: string; onPress: () => void };
}) {
  return (
    <View style={{ flexDirection: "row", gap: space.md, alignItems: "flex-start" }}>
      <Ionicons name={icon} size={18} color={colors.muted} style={{ marginTop: 2 }} />
      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={[styles.infoValue, value && accent ? { color: accent } : null]}>{value || "—"}</Text>
        {link ? (
          <Text style={styles.infoLink} onPress={link.onPress}>
            {link.label}
          </Text>
        ) : null}
      </View>
      {action ? (
        <Pressable onPress={action.onPress} hitSlop={8} style={styles.infoAction}>
          <Ionicons name={action.icon} size={16} color={colors.brand} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { width: "100%", height: HERO_HEIGHT },
  heroEmpty: { alignItems: "center", justifyContent: "center", gap: space.sm },
  heroEmptyText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  heroShade: { position: "absolute", top: 0, left: 0, right: 0, height: 110 },
  cameraButton: {
    position: "absolute",
    right: space.lg,
    bottom: space.xl + space.md,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(15,23,42,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  hotTag: {
    position: "absolute",
    right: space.lg,
    top: 100,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.danger,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  hotTagText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  headerPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(15,23,42,0.45)",
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  headerPillText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  sheet: {
    marginTop: -space.xl,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    ...shadow,
  },
  name: { fontSize: 24, fontWeight: "800", color: colors.ink },
  subtitle: { fontSize: 14, color: colors.muted, marginTop: 2 },
  actions: { flexDirection: "row", justifyContent: "space-between", marginTop: space.lg },
  action: { alignItems: "center", flex: 1 },
  actionIcon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  actionLabel: { fontSize: 12, color: colors.text, fontWeight: "500", marginTop: 6 },
  tabs: { flexDirection: "row", marginTop: space.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  tab: { flex: 1, alignItems: "center", paddingVertical: space.md, borderBottomWidth: 2, borderBottomColor: "transparent", marginBottom: -1 },
  tabActive: { borderBottomColor: colors.brand },
  tabText: { fontSize: 13, fontWeight: "500", color: colors.muted },
  sectionLabel: { fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: space.sm },
  infoLabel: { fontSize: 12, color: colors.muted },
  infoValue: { fontSize: 15, fontWeight: "500", color: colors.ink, marginTop: 1 },
  infoLink: { fontSize: 13, fontWeight: "600", color: colors.brand, marginTop: 4 },
  infoAction: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    ...brandShadow,
    shadowOpacity: 0.08,
  },
  dealRow: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md },
  dealDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  dealTitle: { fontSize: 15, fontWeight: "800", color: colors.ink },
  dealMeta: { fontSize: 13, fontWeight: "500", color: colors.muted },
});
