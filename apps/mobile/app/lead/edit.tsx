import { useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Switch, Text, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { LEAD_STATUSES, LEAD_STATUS_LABELS, type LeadStatus } from "@digitel/shared";
import { DateTimeField } from "@/components/DateTimeField";
import { Button, Chip, ChipRow, ErrorText, Field, Input, Loading } from "@/components/ui";
import {
  ApiError,
  createLead,
  getLead,
  listLeadFields,
  updateLead,
  type CustomFieldDefinition,
  type LeadInput,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { addressFor, currentFix, LocationError } from "@/lib/location";
import { colors, space } from "@/theme";

type CustomValue = string | boolean;

/** Add a lead (no id) or edit one (`?id=`), including the workspace's own lead fields. */
export default function EditLeadScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { me } = useAuth();
  const [loading, setLoading] = useState(true);
  const [fields, setFields] = useState<CustomFieldDefinition[]>([]);
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<LeadStatus>("new");
  const [value, setValue] = useState("");
  const [address, setAddress] = useState("");
  const [pin, setPin] = useState<{ latitude: number; longitude: number; accuracy: number | null } | null>(null);
  const [locating, setLocating] = useState(false);
  const [expectedClose, setExpectedClose] = useState<Date | null>(null);
  const [isHot, setIsHot] = useState(false);
  const [notes, setNotes] = useState("");
  const [custom, setCustom] = useState<Record<string, CustomValue>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [fieldRes, lead] = await Promise.all([
          listLeadFields().catch(() => [] as CustomFieldDefinition[]),
          id ? getLead(id) : Promise.resolve(null),
        ]);
        setFields(fieldRes);
        if (lead) {
          setName(lead.name);
          setCompany(lead.company ?? "");
          setPhone(lead.phone ?? "");
          setEmail(lead.email ?? "");
          setStatus(lead.status);
          setValue(lead.valuePaise ? String(lead.valuePaise / 100) : "");
          setAddress(lead.address ?? "");
          if (lead.latitude !== null && lead.longitude !== null) {
            setPin({ latitude: lead.latitude, longitude: lead.longitude, accuracy: null });
          }
          setExpectedClose(lead.expectedCloseAt ? new Date(lead.expectedCloseAt) : null);
          setIsHot(lead.isHot);
          setNotes(lead.notes ?? "");
          const answers: Record<string, CustomValue> = {};
          for (const [key, v] of Object.entries(lead.customFieldsJson ?? {})) {
            answers[key] = typeof v === "boolean" ? v : String(v);
          }
          setCustom(answers);
        }
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Could not load");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const activeFields = useMemo(() => fields.filter((f) => f.isActive), [fields]);

  /** Pins the lead to the rep's position and fills the address if it's empty. */
  async function useCurrentLocation() {
    setLocating(true);
    setError(null);
    try {
      const fix = await currentFix();
      setPin(fix);
      const found = await addressFor(fix);
      if (found && !address.trim()) setAddress(found);
    } catch (err) {
      setError(err instanceof LocationError ? err.message : "Couldn't get your location");
    } finally {
      setLocating(false);
    }
  }

  async function save() {
    const rupees = value.trim() ? Number(value.trim()) : null;
    if (rupees !== null && !Number.isFinite(rupees)) {
      setError("Expected value must be a number.");
      return;
    }
    const input: LeadInput = {
      name: name.trim(),
      company: company.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      status,
      valuePaise: rupees === null ? null : Math.round(rupees * 100),
      address: address.trim() || null,
      ...(pin ? { latitude: pin.latitude, longitude: pin.longitude } : {}),
      expectedCloseAt: expectedClose ? expectedClose.toISOString() : null,
      isHot,
      notes: notes.trim() || null,
      customFields: custom,
    };
    setBusy(true);
    setError(null);
    try {
      if (id) {
        await updateLead(id, input);
        router.back();
      } else {
        // A rep adding a lead in the field is taking it on themselves.
        const lead = await createLead({ ...input, ownerUserId: me?.user.id ?? null });
        router.replace(`/lead/${lead.id}`);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save this lead");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Loading />;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Stack.Screen options={{ title: id ? "Edit lead" : "Add new lead" }} />
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xl }} keyboardShouldPersistTaps="handled">
        <Field label="Contact person" required>
          <Input value={name} onChangeText={setName} placeholder="Enter contact person name" />
        </Field>
        <Field label="Business name">
          <Input value={company} onChangeText={setCompany} placeholder="Enter business name" />
        </Field>
        <Field label="Mobile number">
          <Input value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="919876543210" />
        </Field>
        <Field label="Email">
          <Input
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholder="Enter email address"
          />
        </Field>
        <Field label="Address">
          <Input value={address} onChangeText={setAddress} multiline placeholder="Shop no., street, area, city" />
          <Button
            title={pin ? "Update to my current location" : "Use current location"}
            variant="secondary"
            onPress={() => void useCurrentLocation()}
            loading={locating}
            style={{ marginTop: space.sm }}
          />
          {pin ? (
            <Text style={{ color: colors.success, fontSize: 13, marginTop: 6 }}>
              Location pinned{pin.accuracy ? ` (±${Math.round(pin.accuracy)} m)` : ""} — used for visit check-ins and Nearby.
            </Text>
          ) : null}
        </Field>
        <Field label="Stage">
          <ChipRow>
            {LEAD_STATUSES.map((s) => (
              <Chip key={s} label={LEAD_STATUS_LABELS[s]} active={status === s} onPress={() => setStatus(s)} />
            ))}
          </ChipRow>
        </Field>
        <Field label="Expected value (₹)">
          <Input value={value} onChangeText={setValue} keyboardType="decimal-pad" placeholder="50000" />
        </Field>
        <Field label="Expected close">
          <DateTimeField value={expectedClose} onChange={setExpectedClose} mode="date" placeholder="Pick a date" />
        </Field>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: space.md }}>
          <Text style={{ fontSize: 15, fontWeight: "600", color: colors.text }}>Hot lead</Text>
          <Switch value={isHot} onValueChange={setIsHot} trackColor={{ true: colors.brand, false: colors.border }} />
        </View>

        {activeFields.map((field) => (
          <CustomField
            key={field.id}
            field={field}
            value={custom[field.key]}
            onChange={(v) => setCustom((prev) => ({ ...prev, [field.key]: v }))}
          />
        ))}

        <Field label="Notes">
          <Input value={notes} onChangeText={setNotes} multiline placeholder="Anything worth remembering" />
        </Field>

        <ErrorText text={error} />
        <Button title={id ? "Save changes" : "Save lead"} onPress={() => void save()} loading={busy} disabled={!name.trim()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** One of the workspace's own lead fields, as set up under Lead Fields on the web. */
function CustomField({
  field,
  value,
  onChange,
}: {
  field: CustomFieldDefinition;
  value: CustomValue | undefined;
  onChange: (value: CustomValue) => void;
}) {
  const options = field.optionsJson ?? [];
  if (field.type === "checkbox") {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: space.md }}>
        <Text style={{ fontSize: 15, fontWeight: "600", color: colors.text, flex: 1 }}>{field.label}</Text>
        <Switch value={value === true} onValueChange={onChange} trackColor={{ true: colors.brand, false: colors.border }} />
      </View>
    );
  }
  return (
    <Field label={field.label} required={field.required} hint={field.helpText}>
      {field.type === "dropdown" || field.type === "radio" ? (
        <ChipRow>
          {options.map((option) => (
            <Chip key={option} label={option} active={value === option} onPress={() => onChange(value === option ? "" : option)} />
          ))}
        </ChipRow>
      ) : field.type === "date" ? (
        <DateTimeField
          mode="date"
          value={typeof value === "string" && value ? new Date(value) : null}
          onChange={(d) => onChange(toDateString(d))}
          placeholder={field.placeholder ?? "Pick a date"}
        />
      ) : (
        <Input
          value={typeof value === "string" ? value : ""}
          onChangeText={onChange}
          multiline={field.type === "textarea"}
          keyboardType={field.type === "number" ? "decimal-pad" : "default"}
          placeholder={field.placeholder ?? undefined}
        />
      )}
    </Field>
  );
}

function toDateString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
