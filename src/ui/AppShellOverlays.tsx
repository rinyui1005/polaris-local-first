import { Suspense, lazy, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  loadApiProviderSheetModule,
  loadCollaboratorBuilderTabModule,
  loadCompanionSetupSheetModule,
  loadMenuSheetModule
} from './app-shell/appShellLazyModules';
import type { AppShellOverlaysProps } from '../app/shell/appShellContracts';
import { RuntimePerformanceSurfaceFallback, RuntimePerformanceSurfaceMounted } from './runtime-performance/RuntimePerformanceSurfaceSignals';
import { Icon } from './Icon';
import { useI18n } from '../i18n';

const ApiProviderSheet = lazy(() => loadApiProviderSheetModule().then((module) => ({ default: module.ApiProviderSheet })));
const CollaboratorBuilderTab = lazy(() => loadCollaboratorBuilderTabModule().then((module) => ({ default: module.PersonaBuilderTab })));
const CompanionSetupSheet = lazy(() => loadCompanionSetupSheetModule().then((module) => ({ default: module.CompanionSetupSheet })));
const MenuSheet = lazy(() => loadMenuSheetModule().then((module) => ({ default: module.MenuSheet })));

function SheetSurfaceFallback({
  surface,
  label,
  overlayClassName = '',
  sheetClassName = ''
}: {
  surface: Parameters<typeof RuntimePerformanceSurfaceFallback>[0]['surface'];
  label: string;
  overlayClassName?: string;
  sheetClassName?: string;
}) {
  const overlayClass = ['settings-overlay', overlayClassName].filter(Boolean).join(' ');
  const className = ['settings-sheet', sheetClassName].filter(Boolean).join(' ');

  return (
    <div className={overlayClass} aria-hidden="true">
      <div className={className}>
        <RuntimePerformanceSurfaceFallback surface={surface} label={label} />
      </div>
    </div>
  );
}

export function AppShellOverlays({
  menu,
  api,
  collaboratorBuilder,
  companionSetup
}: AppShellOverlaysProps) {
  const { t } = useI18n();

  useEffect(() => {
    const preloadSheets = () => {
      void loadMenuSheetModule();
      void loadApiProviderSheetModule();
      void loadCompanionSetupSheetModule();
    };
    if (typeof window === 'undefined') {
      preloadSheets();
      return;
    }
    const requestIdle = window.requestIdleCallback;
    if (requestIdle) {
      const handle = requestIdle(preloadSheets, { timeout: 1800 });
      return () => window.cancelIdleCallback?.(handle);
    }
    const handle = window.setTimeout(preloadSheets, 320);
    return () => window.clearTimeout(handle);
  }, []);

  const overlayContent = (
    <>
      {menu.open && (
        <Suspense fallback={<SheetSurfaceFallback surface="menu-sheet" label={t('app.overlays.loadingMenu')} overlayClassName="menu-overlay" sheetClassName="menu-sheet" />}>
          <MenuSheet
            open={menu.open}
            initialPage={menu.initialPage}
            theme={menu.theme}
            onClose={menu.onClose}
            onOpenApi={menu.onOpenApi}
            onOpenCompanionSetup={() => {
              menu.onClose();
              companionSetup.onOpen();
            }}
          />
        </Suspense>
      )}
      {api.open && (
        <Suspense fallback={<SheetSurfaceFallback surface="provider-sheet" label={t('app.overlays.loadingProviderSettings')} />}>
          <ApiProviderSheet
            open={api.open}
            providers={api.providers}
            activeProviderId={api.activeProviderId}
            api={api.api}
            apiTesting={api.apiTesting}
            apiTestResult={api.apiTestResult}
            apiBatchTestState={api.apiBatchTestState}
            onBackToMenu={api.onBackToMenu}
            onClose={api.onClose}
            onSetActiveProvider={api.onSetActiveProvider}
            onCreateProvider={api.onCreateProvider}
            onImportProvider={api.onImportProvider}
            onDuplicateProvider={api.onDuplicateProvider}
            onDeleteProvider={api.onDeleteProvider}
            onSetApiConfig={api.onSetApiConfig}
            onRunApiTest={api.onRunApiTest}
            onRunProviderBatchTest={api.onRunProviderBatchTest}
          />
        </Suspense>
      )}
      {collaboratorBuilder.open && (
        <Suspense fallback={<SheetSurfaceFallback surface="persona-builder" label={t('app.overlays.loadingPersonaBuilder')} sheetClassName="persona-fullscreen" />}>
          <div className="settings-overlay persona-builder-overlay" onClick={(event) => { if (event.target === event.currentTarget) collaboratorBuilder.onClose(); }}>
            <div className="settings-sheet persona-fullscreen persona-builder-sheet">
              <RuntimePerformanceSurfaceMounted surface="persona-builder" />
              <div className="ps-topbar">
                <div className="ps-topbar-left">
                  <span className="ps-topbar-title">{t('app.overlays.personaBuilderTitle')}</span>
                  <span className="ps-topbar-sub">{collaboratorBuilder.targetCollaborator?.name || t('app.overlays.newRelationship')}</span>
                </div>
                <button type="button" className="ps-topbar-close" aria-label={t('app.overlays.closePersonaBuilder')} onClick={collaboratorBuilder.onClose}>
                  <Icon name="x" size={15} />
                </button>
              </div>
              <div className="ps-content">
                <div className="ps-section ps-section--builder">
                  <CollaboratorBuilderTab
                    activePersona={collaboratorBuilder.targetCollaborator}
                    onApplyToCurrent={collaboratorBuilder.onApplyToCurrent}
                    onCreateCollaborator={collaboratorBuilder.onCreateCollaborator}
                  />
                </div>
              </div>
            </div>
          </div>
        </Suspense>
      )}
      {companionSetup.open && (
        <Suspense fallback={<SheetSurfaceFallback surface="companion-setup" label={t('app.overlays.loadingCompanionSetup')} sheetClassName="companion-setup-sheet" />}>
          <CompanionSetupSheet open={companionSetup.open} onClose={companionSetup.onClose} />
        </Suspense>
      )}
    </>
  );

  if (typeof document === 'undefined') return overlayContent;
  return createPortal(
    <div className="app-global-overlays">
      {overlayContent}
    </div>,
    document.body
  );
}
