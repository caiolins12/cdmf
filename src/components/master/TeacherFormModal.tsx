import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons, FontAwesome5 } from "@/shims/icons";
import { BaseModal, ModalButtons, FormInput, showAlert } from "../ui";
import { colors } from "../../theme/colors";
import { Profile } from "../../contexts/AuthContext";

interface TeacherFormModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (data: { name: string; phone?: string }) => Promise<{ code: string; password: string } | void>;
  teacher?: Profile | null; // Se fornecido, é modo de edição
  loading?: boolean;
}

export default function TeacherFormModal({
  visible,
  onClose,
  onSave,
  teacher,
  loading = false,
}: TeacherFormModalProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [showCredentials, setShowCredentials] = useState(false);
  const [credentials, setCredentials] = useState<{ code: string; password: string } | null>(null);

  const isEditMode = !!teacher;

  useEffect(() => {
    if (visible) {
      if (teacher) {
        setName(teacher.name || "");
        setPhone(teacher.phone || "");
      } else {
        setName("");
        setPhone("");
      }
      setShowCredentials(false);
      setCredentials(null);
    }
  }, [visible, teacher]);

  const handleSave = async () => {
    if (!name.trim()) {
      showAlert("Atenção", "Digite o nome do professor");
      return;
    }

    setSaving(true);
    try {
      const result = await onSave({
        name: name.trim(),
        phone: phone.trim() || undefined,
      });

      if (result && !isEditMode) {
        // Criação: mostra credenciais
        setCredentials(result);
        setShowCredentials(true);
      } else {
        // Edição: fecha o modal
        onClose();
      }
    } catch (e: any) {
      showAlert("Erro", e.message || "Não foi possível salvar");
    } finally {
      setSaving(false);
    }
  };

  const handleCloseCredentials = () => {
    setShowCredentials(false);
    setCredentials(null);
    onClose();
  };

  // Modal de credenciais (após criação)
  if (showCredentials && credentials) {
    return (
      <BaseModal
        visible={visible}
        onClose={handleCloseCredentials}
        size="small"
        showCloseButton={false}
        scrollable={false}
      >
        <View style={styles.credentialsContent}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark-circle" size={64} color={colors.green} />
          </View>

          <Text style={styles.credentialsTitle}>Professor Criado!</Text>
          <Text style={styles.credentialsSubtitle}>Credenciais de acesso:</Text>

          <View style={styles.credentialsBox}>
            <View style={styles.credentialRow}>
              <Text style={styles.credentialLabel}>Código:</Text>
              <Text style={styles.credentialValue}>{credentials.code}</Text>
            </View>
            <View style={styles.credentialRow}>
              <Text style={styles.credentialLabel}>Senha:</Text>
              <Text style={styles.credentialValue}>{credentials.password}</Text>
            </View>
          </View>

          <Text style={styles.warningText}>
            Anote e guarde estas informações com segurança!
          </Text>
        </View>

        <ModalButtons
          primaryLabel="Entendi"
          onPrimaryPress={handleCloseCredentials}
          variant="success"
        />
      </BaseModal>
    );
  }

  // Modal de formulário (criar/editar)
  return (
    <BaseModal
      visible={visible}
      onClose={onClose}
      title={isEditMode ? "Editar Professor" : "Novo Professor"}
      icon={
        isEditMode ? (
          <Ionicons name="create-outline" size={24} color={colors.purple} />
        ) : (
          <FontAwesome5 name="chalkboard-teacher" size={22} color={colors.purple} />
        )
      }
      loading={saving || loading}
      footer={
        <ModalButtons
          primaryLabel={isEditMode ? "Salvar" : "Criar"}
          secondaryLabel="Cancelar"
          onPrimaryPress={handleSave}
          onSecondaryPress={onClose}
          primaryLoading={saving}
          primaryIcon={isEditMode ? "checkmark" : "add"}
        />
      }
    >
      <FormInput
        label="Nome completo"
        value={name}
        onChangeText={setName}
        placeholder="Ex: Maria Silva"
        required
        editable={!saving}
      />

      <FormInput
        label="Telefone"
        value={phone}
        onChangeText={setPhone}
        placeholder="(00) 00000-0000"
        keyboardType="phone-pad"
        hint={!isEditMode ? "Opcional" : undefined}
        editable={!saving}
      />

      {!isEditMode && (
        <View style={styles.infoBox}>
          <Ionicons name="information-circle" size={18} color={colors.purple} />
          <Text style={styles.infoText}>
            Será gerado um código e senha para o professor acessar o sistema
          </Text>
        </View>
      )}
    </BaseModal>
  );
}

const styles = StyleSheet.create({
  infoBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EDE9FE",
    padding: 12,
    borderRadius: 10,
    gap: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: colors.purple,
    lineHeight: 16,
  },
  credentialsContent: {
    alignItems: "center",
    paddingVertical: 8,
  },
  successIcon: {
    marginBottom: 8,
  },
  credentialsTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1E293B",
    marginBottom: 4,
  },
  credentialsSubtitle: {
    fontSize: 14,
    color: "#64748B",
    marginBottom: 16,
  },
  credentialsBox: {
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    padding: 16,
    width: "100%",
    marginBottom: 16,
  },
  credentialRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  credentialLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748B",
  },
  credentialValue: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.purple,
  },
  warningText: {
    fontSize: 12,
    color: colors.danger,
    textAlign: "center",
  },
});


