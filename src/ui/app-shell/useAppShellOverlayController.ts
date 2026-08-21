import { buildAppShellOverlaysProps } from '../../app/shell/buildAppShellProps';
import { useAppShellApiActions } from './useAppShellApiActions';
import { useAppShellCollaboratorActions } from './useAppShellCollaboratorActions';
import { useAppModalState } from './useAppModalState';
import { useAppShellOverlayNavigation } from './useAppShellOverlayNavigation';
import { useThemeSessionActions } from '../../app/theme/useThemeSessionActions';
import type { ThemeState } from '../../types/domain';

type UseAppShellOverlayControllerArgs = {
  stores: {
    space: {
      theme: ThemeState;
      deleteCollaboratorThemeSession: Parameters<typeof useAppShellCollaboratorActions>[0]['deleteCollaboratorThemeSession'];
    };
    runtime: {
      api: Parameters<typeof useAppShellApiActions>[0]['api'];
      providers: Parameters<typeof useAppShellApiActions>[0]['providers'];
      activeProviderId: string | null;
      setApiConfig: Parameters<typeof useAppShellApiActions>[0]['setApiConfig'];
      setActiveProvider: Parameters<typeof useAppShellApiActions>[0]['setActiveProvider'];
      createProvider: Parameters<typeof useAppShellApiActions>[0]['createProvider'];
      importProvider: Parameters<typeof useAppShellApiActions>[0]['importProvider'];
      duplicateProvider: Parameters<typeof useAppShellApiActions>[0]['duplicateProvider'];
      deleteProvider: Parameters<typeof useAppShellApiActions>[0]['deleteProvider'];
      companionConnections: Parameters<typeof useAppShellCollaboratorActions>[0]['companionConnections'];
    };
    collaborator: {
      personas: Parameters<typeof useAppShellCollaboratorActions>[0]['personas'];
      activeCollaboratorId: string | null;
      createPersona: Parameters<typeof useAppShellCollaboratorActions>[0]['createPersona'];
      deleteCollaborator: Parameters<typeof useAppShellCollaboratorActions>[0]['deleteCollaborator'];
      setActiveCollaborator: Parameters<typeof useAppShellCollaboratorActions>[0]['setActiveCollaborator'];
      updateCollaborator: Parameters<typeof useAppShellCollaboratorActions>[0]['updateCollaborator'];
    };
    chat: {
      conversations: Parameters<typeof useAppShellCollaboratorActions>[0]['conversations'];
      activeConversationId: string | null;
      activeConversationCollaboratorId: string | null;
      createConversation: Parameters<typeof useAppShellCollaboratorActions>[0]['createConversation'];
      orphanConversation: Parameters<typeof useAppShellCollaboratorActions>[0]['orphanConversation'];
      setActiveConversation: Parameters<typeof useAppShellCollaboratorActions>[0]['setActiveConversation'];
    };
    collection: {
      createCard: Parameters<typeof useAppShellCollaboratorActions>[0]['createCard'];
    };
  };
  collection: {
    setCollaboratorSwitchOpen: (next: boolean | ((prev: boolean) => boolean)) => void;
  };
  frontstage: {
    frontstageCollaboratorId: string | null;
    editingCollaboratorId: string | null;
    activeWorld: Parameters<typeof useAppShellCollaboratorActions>[0]['activeWorld'];
    collectionShelf: Parameters<typeof useAppShellCollaboratorActions>[0]['collectionShelf'];
    setFrontstageCollaboratorId: Parameters<typeof useAppShellCollaboratorActions>[0]['setFrontstageCollaboratorId'];
    setEditingCollaboratorId: Parameters<typeof useAppShellCollaboratorActions>[0]['setEditingCollaboratorId'];
    clearPendingAttachments: Parameters<typeof useAppShellCollaboratorActions>[0]['clearPendingAttachments'];
    clearPendingCardReference: Parameters<typeof useAppShellCollaboratorActions>[0]['clearPendingCardReference'];
    setActiveCard: Parameters<typeof useAppShellCollaboratorActions>[0]['setActiveCard'];
    spotlightCard: Parameters<typeof useAppShellCollaboratorActions>[0]['spotlightCard'];
    setWorld: Parameters<typeof useAppShellCollaboratorActions>[0]['setWorld'];
    setCollectionShelf: Parameters<typeof useAppShellCollaboratorActions>[0]['setCollectionShelf'];
  };
};

export function useAppShellOverlayController({
  stores,
  collection,
  frontstage
}: UseAppShellOverlayControllerArgs) {
  const modals = useAppModalState();
  const themeSession = useThemeSessionActions();
  const navigation = useAppShellOverlayNavigation(modals);

  const collaboratorActions = useAppShellCollaboratorActions({
    personas: stores.collaborator.personas,
    conversations: stores.chat.conversations,
    companionConnections: stores.runtime.companionConnections,
    editingCollaboratorId: frontstage.editingCollaboratorId,
    collaboratorBuilderTargetId: modals.collaboratorBuilderTargetId,
    frontstageCollaboratorId: frontstage.frontstageCollaboratorId,
    activeCollaboratorId: stores.collaborator.activeCollaboratorId,
    activeWorld: frontstage.activeWorld,
    collectionShelf: frontstage.collectionShelf,
    activeConversationId: stores.chat.activeConversationId,
    activeConversationCollaboratorId: stores.chat.activeConversationCollaboratorId,
    createConversation: stores.chat.createConversation,
    createPersona: stores.collaborator.createPersona,
    createCard: stores.collection.createCard,
    deleteCollaborator: stores.collaborator.deleteCollaborator,
    orphanConversation: stores.chat.orphanConversation,
    updateCollaborator: stores.collaborator.updateCollaborator,
    setActiveCollaborator: stores.collaborator.setActiveCollaborator,
    setEditingCollaboratorId: frontstage.setEditingCollaboratorId,
    setActiveCard: frontstage.setActiveCard,
    spotlightCard: frontstage.spotlightCard,
    setActiveConversation: stores.chat.setActiveConversation,
    deleteCollaboratorThemeSession: stores.space.deleteCollaboratorThemeSession,
    setWorld: frontstage.setWorld,
    setCollectionShelf: frontstage.setCollectionShelf,
    setFrontstageCollaboratorId: frontstage.setFrontstageCollaboratorId,
    clearPendingAttachments: frontstage.clearPendingAttachments,
    clearPendingCardReference: frontstage.clearPendingCardReference,
    rollbackPreviewForConversationDeletion: themeSession.rollbackPreviewForConversationDeletion,
    closeMenu: navigation.closeMenu,
    setCollaboratorBuilderOpen: modals.setCollaboratorBuilderOpen,
    setCollaboratorBuilderTargetId: modals.setCollaboratorBuilderTargetId
  });

  const apiActions = useAppShellApiActions({
    api: stores.runtime.api,
    activeProviderId: stores.runtime.activeProviderId,
    providers: stores.runtime.providers,
    createProvider: stores.runtime.createProvider,
    importProvider: stores.runtime.importProvider,
    duplicateProvider: stores.runtime.duplicateProvider,
    deleteProvider: stores.runtime.deleteProvider,
    setApiConfig: stores.runtime.setApiConfig,
    setActiveProvider: stores.runtime.setActiveProvider,
    setApiTesting: modals.setApiTesting,
    setApiTestResult: modals.setApiTestResult,
    setApiBatchTestState: modals.setApiBatchTestState
  });

  const overlaysProps = buildAppShellOverlaysProps({
    menuOpen: modals.menuOpen,
    menuInitialPage: modals.menuInitialPage,
    theme: stores.space.theme,
    providers: stores.runtime.providers,
    activeProviderId: stores.runtime.activeProviderId,
    api: stores.runtime.api,
    apiTesting: modals.apiTesting,
    apiTestResult: modals.apiTestResult,
    apiBatchTestState: modals.apiBatchTestState,
    apiOpen: modals.apiOpen,
    collaboratorBuilderOpen: modals.collaboratorBuilderOpen,
    companionSetupOpen: modals.companionSetupOpen,
    closeMenu: navigation.closeMenu,
    openApiFromMenu: navigation.openApiFromMenu,
    closeApi: navigation.closeApi,
    backToMenuFromApi: navigation.backToMenuFromApi,
    providerActions: apiActions.providerActions,
    runApiTest: apiActions.runApiTest,
    runProviderBatchTest: apiActions.runProviderBatchTest,
    collaboratorBuilderBridge: {
      open: modals.collaboratorBuilderOpen,
      targetCollaborator: collaboratorActions.collaboratorBuilderBridge.builderTargetCollaborator,
      onClose: collaboratorActions.collaboratorBuilderBridge.closeCollaboratorBuilder,
      onApplyToCurrent: collaboratorActions.collaboratorBuilderBridge.applyBuilderToCurrent,
      onCreateCollaborator: collaboratorActions.collaboratorBuilderBridge.createCollaboratorFromBuilder
    },
    companionSetupBridge: {
      open: modals.companionSetupOpen,
      onClose: () => modals.setCompanionSetupOpen(false),
      onOpen: () => modals.setCompanionSetupOpen(true)
    }
  });

  return {
    modals,
    toggleMenu: navigation.toggleMenu,
    openMenuAt: navigation.openMenuAt,
    overlaysProps,
    collaboratorActions,
    collectionOpenCollaboratorBuilderForCreate: () => {
      collection.setCollaboratorSwitchOpen(false);
      collaboratorActions.openCollaboratorBuilder(null);
    },
    collectionCreateCustomCollaborator: collaboratorActions.createCustomCollaborator,
    collectionOpenProviderSettings: () => {
      collection.setCollaboratorSwitchOpen(false);
      navigation.openApiFromMenu('root');
    },
    collectionOpenSettings: () => {
      collection.setCollaboratorSwitchOpen(false);
      navigation.openMenuAt('root');
    },
    collectionOpenDesktopLocalSettings: () => {
      collection.setCollaboratorSwitchOpen(false);
      navigation.openMenuAt('desktopLocal');
    },
    canReviveTheme: stores.space.theme.skinHistory.length > 0,
    restoreLastThemeSkin: () => themeSession.rollbackLastSkin(),
    restoreDefaultTheme: () => themeSession.restoreDefaultTheme()
  };
}
