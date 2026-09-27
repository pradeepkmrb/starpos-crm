import { useState } from "react";
import { Platform, Pressable } from "react-native";
import { Text } from "@/components/AppText";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { formatDate, formatWhen } from "@/lib/format";
import { colors } from "@/theme";
import { Input, styles } from "./ui";

/**
 * A date (or date + time) picker that uses each platform's native control:
 * Android's dialogs, iOS's inline picker, and a typed value in a browser
 * preview, where there is no native picker.
 */
export function DateTimeField({
  value,
  onChange,
  mode = "datetime",
  placeholder = "Pick a time",
}: {
  value: Date | null;
  onChange: (value: Date) => void;
  mode?: "date" | "datetime";
  placeholder?: string;
}) {
  const [iosOpen, setIosOpen] = useState(false);
  const [webText, setWebText] = useState(value ? toWebText(value, mode) : "");

  if (Platform.OS === "web") {
    return (
      <Input
        value={webText}
        placeholder={mode === "date" ? "YYYY-MM-DD" : "YYYY-MM-DD HH:MM"}
        onChangeText={(text) => {
          setWebText(text);
          const parsed = new Date(text.replace(" ", "T"));
          if (!Number.isNaN(parsed.getTime())) onChange(parsed);
        }}
      />
    );
  }

  function open() {
    const initial = value ?? new Date();
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: initial,
        mode: "date",
        onChange: (event, date) => {
          if (event.type !== "set" || !date) return;
          if (mode === "date") {
            onChange(date);
            return;
          }
          DateTimePickerAndroid.open({
            value: date,
            mode: "time",
            onChange: (timeEvent, time) => {
              if (timeEvent.type === "set" && time) onChange(time);
            },
          });
        },
      });
    } else {
      setIosOpen((o) => !o);
    }
  }

  const label = value ? (mode === "date" ? formatDate(value.toISOString()) : formatWhen(value.toISOString())) : placeholder;
  return (
    <>
      <Pressable onPress={open} style={styles.input} accessibilityRole="button">
        <Text style={{ fontSize: 16, color: value ? colors.ink : colors.faint }}>{label}</Text>
      </Pressable>
      {Platform.OS === "ios" && iosOpen && (
        <DateTimePicker
          value={value ?? new Date()}
          mode={mode}
          display="inline"
          onChange={(_, date) => date && onChange(date)}
        />
      )}
    </>
  );
}

function toWebText(d: Date, mode: "date" | "datetime"): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return mode === "date" ? date : `${date} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
