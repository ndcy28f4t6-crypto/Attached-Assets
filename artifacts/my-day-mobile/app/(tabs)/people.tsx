import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useAppState } from '@/context/AppStateContext';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import type { Person, PersonFrequency } from '@workspace/api-client-react';

type PersonForm = {
  name: string;
  relationship: string;
  contactMethod: string;
  frequency: PersonFrequency;
  birthday: string;
  importantDateLabel: string;
  importantDate: string;
  notes: string;
};

const frequencyOptions: Array<{ value: PersonFrequency; label: string }> = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'none', label: 'No reminders' },
];

function emptyForm(): PersonForm {
  return {
    name: '',
    relationship: '',
    contactMethod: '',
    frequency: 'monthly',
    birthday: '',
    importantDateLabel: '',
    importantDate: '',
    notes: '',
  };
}

function formatDate(value?: string): string {
  if (!value) return '';
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function lastConnection(person: Person): string {
  if (!person.lastConnectedAt) return 'No connection logged yet';
  return `Last connected ${formatDate(person.lastConnectedAt)}`;
}

function connectionRhythm(frequency: PersonFrequency): string {
  if (frequency === 'weekly') return 'Weekly rhythm';
  if (frequency === 'biweekly') return 'Every two weeks';
  if (frequency === 'monthly') return 'Monthly rhythm';
  if (frequency === 'custom') return 'Personal rhythm';
  return 'No reminders';
}

function PersonCard({
  person,
  colors,
  onLogConnection,
}: {
  person: Person;
  colors: ReturnType<typeof useColors>;
  onLogConnection: (id: string) => void;
}) {
  const styles = makeStyles(colors);
  const dates = [
    ...(person.birthday ? [{ label: 'Birthday', date: person.birthday }] : []),
    ...(person.importantDates ?? []).map((date) => ({
      label: date.label,
      date: date.date,
    })),
  ];

  return (
    <View style={styles.personCard}>
      <View style={styles.personCardHeader}>
        <View style={styles.personAvatar}>
          <Text style={styles.personAvatarText}>{person.name.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.personHeading}>
          <Text style={styles.personName} numberOfLines={1}>{person.name}</Text>
          {!!person.relationship && (
            <Text style={styles.personRelationship} numberOfLines={1}>{person.relationship}</Text>
          )}
        </View>
        <Pressable
          onPress={() => onLogConnection(person.id)}
          style={({ pressed }) => [styles.logButton, pressed && styles.pressed]}
          testID={`log-connection-${person.id}`}
        >
          <Feather name="check" size={15} color={colors.primaryForeground} />
          <Text style={styles.logButtonText}>Log connection</Text>
        </Pressable>
      </View>

      <View style={styles.personMeta}>
        {!!person.contactMethod && (
          <View style={styles.metaItem}>
            <Feather name="message-circle" size={14} color={colors.mutedForeground} />
            <Text style={styles.metaText}>{person.contactMethod}</Text>
          </View>
        )}
        <View style={styles.metaItem}>
          <Feather name="repeat" size={14} color={colors.mutedForeground} />
          <Text style={styles.metaText}>{connectionRhythm(person.frequency)}</Text>
        </View>
      </View>

      <Text style={styles.lastConnection}>{lastConnection(person)}</Text>

      {dates.length > 0 && (
        <View style={styles.datesBlock}>
          <Text style={styles.datesLabel}>Important dates</Text>
          {dates.map((date) => (
            <View style={styles.dateRow} key={`${date.label}-${date.date}`}>
              <Feather name="calendar" size={13} color={colors.primary} />
              <Text style={styles.dateText}>{date.label}</Text>
              <Text style={styles.dateValue}>{formatDate(date.date)}</Text>
            </View>
          ))}
        </View>
      )}

      {!!person.notes && <Text style={styles.notes}>{person.notes}</Text>}
    </View>
  );
}

function PersonComposer({
  visible,
  colors,
  onClose,
  onSave,
}: {
  visible: boolean;
  colors: ReturnType<typeof useColors>;
  onClose: () => void;
  onSave: (form: PersonForm) => void;
}) {
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors);
  const [form, setForm] = useState<PersonForm>(emptyForm);
  const update = <K extends keyof PersonForm>(key: K, value: PersonForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const close = () => {
    setForm(emptyForm());
    onClose();
  };

  const save = () => {
    if (!form.name.trim()) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSave({
      ...form,
      name: form.name.trim(),
      relationship: form.relationship.trim(),
      contactMethod: form.contactMethod.trim(),
      birthday: form.birthday.trim(),
      importantDateLabel: form.importantDateLabel.trim(),
      importantDate: form.importantDate.trim(),
      notes: form.notes.trim(),
    });
    setForm(emptyForm());
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalSheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>Add someone</Text>
              <Text style={styles.modalSubtitle}>Keep the details that help you stay close.</Text>
            </View>
            <Pressable onPress={close} hitSlop={12} testID="close-person-form">
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </Pressable>
          </View>

          <KeyboardAwareScrollViewCompat
            contentContainerStyle={styles.formContent}
            bottomOffset={24}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.fieldLabel}>Name</Text>
            <TextInput
              value={form.name}
              onChangeText={(value) => update('name', value)}
              placeholder="Sarah, Mom, Jo..."
              placeholderTextColor={colors.mutedForeground}
              style={styles.input}
              autoFocus
              testID="person-name"
            />

            <Text style={styles.fieldLabel}>Relationship</Text>
            <TextInput
              value={form.relationship}
              onChangeText={(value) => update('relationship', value)}
              placeholder="Friend, sister, mentor..."
              placeholderTextColor={colors.mutedForeground}
              style={styles.input}
              testID="person-relationship"
            />

            <Text style={styles.fieldLabel}>Preferred way to connect</Text>
            <TextInput
              value={form.contactMethod}
              onChangeText={(value) => update('contactMethod', value)}
              placeholder="Text, call, in person..."
              placeholderTextColor={colors.mutedForeground}
              style={styles.input}
              testID="person-contact-method"
            />

            <Text style={styles.fieldLabel}>Connection rhythm</Text>
            <View style={styles.frequencyGrid}>
              {frequencyOptions.map((option) => {
                const selected = form.frequency === option.value;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => update('frequency', option.value)}
                    style={[styles.frequencyChip, selected && styles.frequencyChipSelected]}
                    testID={`person-frequency-${option.value}`}
                  >
                    <Text style={[styles.frequencyText, selected && styles.frequencyTextSelected]}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.fieldLabel}>Birthday <Text style={styles.optionalLabel}>optional · YYYY-MM-DD</Text></Text>
            <TextInput
              value={form.birthday}
              onChangeText={(value) => update('birthday', value)}
              placeholder="1990-06-21"
              placeholderTextColor={colors.mutedForeground}
              style={styles.input}
              keyboardType="numbers-and-punctuation"
              testID="person-birthday"
            />

            <Text style={styles.fieldLabel}>One important date <Text style={styles.optionalLabel}>optional</Text></Text>
            <View style={styles.dateInputs}>
              <TextInput
                value={form.importantDateLabel}
                onChangeText={(value) => update('importantDateLabel', value)}
                placeholder="Anniversary"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.input, styles.dateLabelInput]}
                testID="person-important-date-label"
              />
              <TextInput
                value={form.importantDate}
                onChangeText={(value) => update('importantDate', value)}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.input, styles.dateValueInput]}
                keyboardType="numbers-and-punctuation"
                testID="person-important-date"
              />
            </View>

            <Text style={styles.fieldLabel}>Notes <Text style={styles.optionalLabel}>optional</Text></Text>
            <TextInput
              value={form.notes}
              onChangeText={(value) => update('notes', value)}
              placeholder="The little things worth remembering..."
              placeholderTextColor={colors.mutedForeground}
              style={[styles.input, styles.notesInput]}
              multiline
              textAlignVertical="top"
              testID="person-notes"
            />

            <Pressable
              onPress={save}
              disabled={!form.name.trim()}
              style={({ pressed }) => [
                styles.saveButton,
                !form.name.trim() && styles.saveButtonDisabled,
                pressed && styles.pressed,
              ]}
              testID="save-person"
            >
              <Feather name="plus" size={17} color={colors.primaryForeground} />
              <Text style={styles.saveButtonText}>Save person</Text>
            </Pressable>
          </KeyboardAwareScrollViewCompat>
        </View>
      </View>
    </Modal>
  );
}

export default function PeopleScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { state, isLoading, isError, isSaving, refetch, addPerson, logConnection } = useAppState();
  const styles = makeStyles(colors);
  const [composerOpen, setComposerOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const people = state?.people ?? [];
  const subtitle = useMemo(
    () => people.length === 0 ? 'A private little place for the people who matter.' : `${people.length} ${people.length === 1 ? 'person' : 'people'} you want to keep close.`,
    [people.length],
  );

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const handleAddPerson = (form: PersonForm) => {
    const importantDates = form.importantDateLabel && form.importantDate
      ? [{ id: Date.now().toString(), label: form.importantDateLabel, date: form.importantDate }]
      : [];
    addPerson({
      name: form.name,
      relationship: form.relationship,
      contactMethod: form.contactMethod,
      frequency: form.frequency,
      birthday: form.birthday || undefined,
      importantDates,
      notes: form.notes,
    });
    setComposerOpen(false);
    setNotice(`${form.name} is here now.`);
    setTimeout(() => setNotice(null), 2800);
  };

  const handleLogConnection = (id: string) => {
    const person = people.find((candidate) => candidate.id === id);
    if (!person) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    logConnection(id);
    setNotice(`Connection with ${person.name} logged.`);
    setTimeout(() => setNotice(null), 2800);
  };

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Feather name="wifi-off" size={32} color={colors.mutedForeground} />
        <Text style={styles.errorText}>Couldn’t load your people</Text>
        <Pressable onPress={() => refetch()} style={styles.retryButton}>
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: topPad + 20, paddingBottom: Platform.OS === 'web' ? 84 + 34 : 110 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>The people who matter</Text>
            <Text style={styles.title}>Stay close, <Text style={styles.titleAccent}>gently.</Text></Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
          </View>
          <Pressable
            onPress={() => setComposerOpen(true)}
            style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
            testID="add-person"
          >
            <Feather name="plus" size={17} color={colors.primaryForeground} />
            <Text style={styles.addButtonText}>Add</Text>
          </Pressable>
        </View>

        {notice && (
          <View style={styles.notice}>
            <Feather name="heart" size={15} color={colors.primary} />
            <Text style={styles.noticeText}>{notice}</Text>
          </View>
        )}

        {isSaving && (
          <View style={styles.savingRow}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.savingText}>Saving gently...</Text>
          </View>
        )}

        {people.length === 0 ? (
          <View style={styles.emptyState}>
            <Feather name="users" size={40} color={colors.accent} />
            <Text style={styles.emptyTitle}>Your people are welcome here.</Text>
            <Text style={styles.emptySubtitle}>
              Add a few people you want to keep close. No importing, no scoring, no pressure.
            </Text>
            <Pressable
              onPress={() => setComposerOpen(true)}
              style={({ pressed }) => [styles.emptyButton, pressed && styles.pressed]}
              testID="empty-add-person"
            >
              <Feather name="plus" size={17} color={colors.primaryForeground} />
              <Text style={styles.emptyButtonText}>Add someone</Text>
            </Pressable>
          </View>
        ) : (
          people.map((person) => (
            <PersonCard
              key={person.id}
              person={person}
              colors={colors}
              onLogConnection={handleLogConnection}
            />
          ))
        )}
      </ScrollView>

      <PersonComposer
        visible={composerOpen}
        colors={colors}
        onClose={() => setComposerOpen(false)}
        onSave={handleAddPerson}
      />
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    container: { flex: 1 },
    content: { paddingHorizontal: 20 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
    headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 24 },
    headerCopy: { flex: 1 },
    eyebrow: { color: colors.mutedForeground, fontSize: 10, fontWeight: '700' as const, letterSpacing: 1.6, textTransform: 'uppercase' as const, fontFamily: 'DMSans_700Bold', marginBottom: 8 },
    title: { color: colors.foreground, fontSize: 31, lineHeight: 36, fontWeight: '700' as const, fontFamily: 'DMSans_700Bold', marginBottom: 5 },
    titleAccent: { fontStyle: 'italic' as const, fontFamily: 'DMSans_400Regular' },
    subtitle: { color: colors.mutedForeground, fontSize: 14, lineHeight: 20, fontFamily: 'DMSans_400Regular' },
    addButton: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 10, marginTop: 2 },
    addButtonText: { color: colors.primaryForeground, fontSize: 13, fontWeight: '600' as const, fontFamily: 'DMSans_600SemiBold' },
    pressed: { opacity: 0.78 },
    notice: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.accent + '55', borderRadius: 12, paddingHorizontal: 13, paddingVertical: 11, marginBottom: 14 },
    noticeText: { color: colors.accentForeground, fontSize: 13, fontFamily: 'DMSans_500Medium', flex: 1 },
    savingRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 12 },
    savingText: { color: colors.mutedForeground, fontSize: 12, fontFamily: 'DMSans_400Regular' },
    personCard: { backgroundColor: colors.card, borderRadius: colors.radius, borderWidth: 1, borderColor: colors.cardBorder, padding: 16, marginBottom: 13 },
    personCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    personAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
    personAvatarText: { color: colors.accentForeground, fontSize: 18, fontWeight: '700' as const, fontFamily: 'DMSans_700Bold' },
    personHeading: { flex: 1 },
    personName: { color: colors.foreground, fontSize: 17, fontWeight: '700' as const, fontFamily: 'DMSans_700Bold', marginBottom: 2 },
    personRelationship: { color: colors.mutedForeground, fontSize: 13, fontFamily: 'DMSans_400Regular' },
    logButton: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
    logButtonText: { color: colors.primaryForeground, fontSize: 11, fontWeight: '600' as const, fontFamily: 'DMSans_600SemiBold' },
    personMeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginTop: 15 },
    metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    metaText: { color: colors.mutedForeground, fontSize: 12, fontFamily: 'DMSans_400Regular' },
    lastConnection: { color: colors.mutedForeground, fontSize: 12, fontFamily: 'DMSans_400Regular', marginTop: 10 },
    datesBlock: { backgroundColor: colors.muted + '88', borderRadius: 10, padding: 10, marginTop: 13 },
    datesLabel: { color: colors.mutedForeground, fontSize: 10, fontWeight: '700' as const, letterSpacing: 0.8, textTransform: 'uppercase' as const, fontFamily: 'DMSans_700Bold', marginBottom: 7 },
    dateRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 5 },
    dateText: { color: colors.foreground, fontSize: 12, fontFamily: 'DMSans_500Medium', flex: 1 },
    dateValue: { color: colors.mutedForeground, fontSize: 12, fontFamily: 'DMSans_400Regular' },
    notes: { color: colors.mutedForeground, fontSize: 12, lineHeight: 18, fontFamily: 'DMSans_400Regular', marginTop: 13 },
    emptyState: { alignItems: 'center', backgroundColor: colors.card, borderRadius: colors.radius, borderWidth: 1, borderColor: colors.cardBorder, borderStyle: 'dashed', paddingHorizontal: 26, paddingVertical: 40, marginTop: 8 },
    emptyTitle: { color: colors.foreground, fontSize: 18, fontWeight: '600' as const, fontFamily: 'DMSans_600SemiBold', marginTop: 14, marginBottom: 7, textAlign: 'center' },
    emptySubtitle: { color: colors.mutedForeground, fontSize: 13, lineHeight: 19, fontFamily: 'DMSans_400Regular', textAlign: 'center', marginBottom: 18 },
    emptyButton: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 15, paddingVertical: 11 },
    emptyButtonText: { color: colors.primaryForeground, fontSize: 13, fontWeight: '600' as const, fontFamily: 'DMSans_600SemiBold' },
    errorText: { color: colors.foreground, fontSize: 16, fontFamily: 'DMSans_500Medium' },
    retryButton: { backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 15, paddingVertical: 10 },
    retryText: { color: colors.primaryForeground, fontSize: 13, fontWeight: '600' as const, fontFamily: 'DMSans_600SemiBold' },
    modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(23, 38, 38, 0.38)' },
    modalSheet: { maxHeight: '94%', backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 10 },
    modalHandle: { width: 38, height: 4, borderRadius: 3, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 14 },
    modalHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 10 },
    modalTitle: { color: colors.foreground, fontSize: 23, fontWeight: '700' as const, fontFamily: 'DMSans_700Bold', marginBottom: 3 },
    modalSubtitle: { color: colors.mutedForeground, fontSize: 13, fontFamily: 'DMSans_400Regular' },
    formContent: { paddingHorizontal: 20, paddingTop: 5, paddingBottom: 24 },
    fieldLabel: { color: colors.foreground, fontSize: 12, fontWeight: '600' as const, fontFamily: 'DMSans_600SemiBold', marginTop: 13, marginBottom: 7 },
    optionalLabel: { color: colors.mutedForeground, fontWeight: '400' as const, fontFamily: 'DMSans_400Regular' },
    input: { minHeight: 46, borderWidth: 1, borderColor: colors.input, borderRadius: 11, backgroundColor: colors.card, color: colors.foreground, fontSize: 15, fontFamily: 'DMSans_400Regular', paddingHorizontal: 13, paddingVertical: 10 },
    frequencyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
    frequencyChip: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 9, backgroundColor: colors.card },
    frequencyChipSelected: { backgroundColor: colors.secondary, borderColor: colors.secondary },
    frequencyText: { color: colors.mutedForeground, fontSize: 12, fontFamily: 'DMSans_500Medium' },
    frequencyTextSelected: { color: colors.secondaryForeground, fontFamily: 'DMSans_600SemiBold' },
    dateInputs: { flexDirection: 'row', gap: 8 },
    dateLabelInput: { flex: 1 },
    dateValueInput: { width: 120 },
    notesInput: { minHeight: 76 },
    saveButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 13, marginTop: 22 },
    saveButtonDisabled: { opacity: 0.4 },
    saveButtonText: { color: colors.primaryForeground, fontSize: 14, fontWeight: '600' as const, fontFamily: 'DMSans_600SemiBold' },
  });
}