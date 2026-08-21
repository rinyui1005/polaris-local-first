import type { MenuTokenUsageSummary } from '../../../app/shell/menuTokenUsage';
import type { LocalDataHealthSnapshot } from '../../../infrastructure/localDataHealth';
import { Icon } from '../../Icon';
import { MenuSheetItem } from './MenuSheetItem';
import { APP_LANGUAGES, APP_LANGUAGE_LABELS, type AppLanguage, useI18n } from '../../../i18n';
import { useSpaceStore } from '../../../stores/spaceStore';

type MenuRootPageProps = {
  enabledToolGroupsCount: number;
  enabledMcpServerCount: number;
  mcpServerCount: number;
  tokenUsageSummary: MenuTokenUsageSummary;
  storageHealthSnapshot: LocalDataHealthSnapshot | null;
  memorySettingsVisible: boolean;
  customFontCount: number;
  desktopLocalAvailable: boolean;
  androidApkUpdateAvailable: boolean;
  onOpenDisplay: () => void;
  onOpenFonts: () => void;
  onOpenMemory: () => void;
  onOpenGeneration: () => void;
  onOpenVoice: () => void;
  onOpenToolbox: () => void;
  onOpenMcp: () => void;
  onOpenDesktopLocal: () => void;
  onOpenUsage: () => void;
  onOpenStorage: () => void;
  onOpenDocs: () => void;
  onOpenApi: () => void;
  onOpenGateway: () => void;
  onOpenCompanionSetup: () => void;
  onOpenBackup: () => void;
  onOpenPrivacy: () => void;
  onClose: () => void;
  onCheckAndroidApkUpdate: () => void;
};

export function MenuRootPage({
  enabledToolGroupsCount,
  enabledMcpServerCount,
  mcpServerCount,
  tokenUsageSummary,
  storageHealthSnapshot,
  memorySettingsVisible,
  customFontCount,
  desktopLocalAvailable,
  androidApkUpdateAvailable,
  onOpenDisplay,
  onOpenFonts,
  onOpenMemory,
  onOpenGeneration,
  onOpenVoice,
  onOpenToolbox,
  onOpenMcp,
  onOpenDesktopLocal,
  onOpenUsage,
  onOpenStorage,
  onOpenDocs,
  onOpenApi,
  onOpenGateway,
  onOpenCompanionSetup,
  onOpenBackup,
  onOpenPrivacy,
  onClose,
  onCheckAndroidApkUpdate
}: MenuRootPageProps) {
  const { t, formatNumber } = useI18n();
  const appLanguage = useSpaceStore((state) => state.appLanguage);
  const setAppLanguage = useSpaceStore((state) => state.setAppLanguage);
  const languageLabel = APP_LANGUAGE_LABELS[appLanguage];
  const setLanguage = (nextLanguage: AppLanguage) => {
    setAppLanguage(nextLanguage);
  };

  return (
    <div className="menu-sheet-page">
      <div className="menu-sheet-header menu-sheet-header-root">
        <button type="button" className="menu-sheet-back menu-sheet-root-back" aria-label={t('common.back')} onClick={onClose}>
          <span className="menu-sheet-back-icon"><Icon name="chevron" size={22} /></span>
        </button>
        <div className="menu-sheet-title">
          <small>{t('settings.title')}</small>
        </div>
      </div>

      <section className="menu-section">
        <div className="menu-section-head">
          <span className="menu-section-kicker">{t('settings.section.language')}</span>
        </div>
        <div className="settings-item menu-language-selector">
          <span className="settings-item-leading">
            <span className="settings-item-icon"><Icon name="compass" size={14} /></span>
            <span className="settings-item-copy">
              <strong>{t('settings.language.title')}</strong>
              <small>{t('settings.language.detail', { language: languageLabel })}</small>
            </span>
          </span>
          <span className="menu-language-options" aria-label={t('language.current')}>
            {APP_LANGUAGES.map((option) => (
              <button
                key={option}
                type="button"
                className={`menu-language-option ${option === appLanguage ? 'active' : ''}`}
                aria-pressed={option === appLanguage}
                onClick={() => setLanguage(option)}
              >
                {option === 'zh-CN' ? t('language.zhCN') : t('language.enUS')}
              </button>
            ))}
          </span>
        </div>
        <p className="menu-section-note menu-language-note">{t('settings.language.help')}</p>
      </section>

      <section className="menu-section">
        <div className="menu-section-head">
          <span className="menu-section-kicker">{t('settings.section.service')}</span>
        </div>
        <MenuSheetItem
          icon="providerRoute"
          title={t('settings.api.title')}
          detail={t('settings.api.detail')}
          helpText={t('settings.api.help')}
          onClick={onOpenApi}
        />
        <MenuSheetItem
          icon="lighthouse"
          title={t('settings.gateway.title')}
          detail={t('settings.gateway.detail')}
          helpText={t('settings.gateway.help')}
          onClick={onOpenGateway}
        />
        <MenuSheetItem
          icon="zap"
          title={t('settings.companion.title')}
          detail={t('settings.companion.detail')}
          helpText={t('settings.companion.help')}
          onClick={onOpenCompanionSetup}
        />
        {androidApkUpdateAvailable ? (
          <MenuSheetItem
            icon="download"
            title={t('settings.androidUpdate.title')}
            detail={t('settings.androidUpdate.detail')}
            helpText={t('settings.androidUpdate.help')}
            onClick={onCheckAndroidApkUpdate}
          />
        ) : null}
      </section>

      <section className="menu-section">
        <div className="menu-section-head">
          <span className="menu-section-kicker">{t('settings.section.capabilities')}</span>
        </div>
        {memorySettingsVisible ? (
          <MenuSheetItem
            icon="feather"
            title={t('settings.memory.title')}
            detail={t('settings.memory.detail')}
            helpText={t('settings.memory.help')}
            onClick={onOpenMemory}
          />
        ) : null}
        <MenuSheetItem
          icon="image"
          title={t('settings.generation.title')}
          detail={t('settings.generation.detail')}
          helpText={t('settings.generation.help')}
          onClick={onOpenGeneration}
        />
        <MenuSheetItem
          icon="voice"
          title={t('settings.voice.title')}
          detail={t('settings.voice.detail')}
          helpText={t('settings.voice.help')}
          onClick={onOpenVoice}
        />
        <MenuSheetItem
          icon="layers"
          title={t('settings.toolbox.title')}
          detail={t('settings.toolbox.detail', { count: formatNumber(enabledToolGroupsCount) })}
          helpText={t('settings.toolbox.help')}
          onClick={onOpenToolbox}
        />
        <MenuSheetItem
          icon="mcpServer"
          title={t('settings.mcp.title')}
          detail={
            mcpServerCount > 0
              ? t('settings.mcp.detailConfigured', { enabled: formatNumber(enabledMcpServerCount), total: formatNumber(mcpServerCount) })
              : t('settings.mcp.detailEmpty')
          }
          helpText={t('settings.mcp.help')}
          onClick={onOpenMcp}
        />
        {desktopLocalAvailable ? (
          <MenuSheetItem
            icon="folder"
            title={t('settings.desktopLocal.title')}
            detail={t('settings.desktopLocal.detail')}
            helpText={t('settings.desktopLocal.help')}
            onClick={onOpenDesktopLocal}
          />
        ) : null}
        <MenuSheetItem
          icon="infoCard"
          title={t('settings.usage.title')}
          detail={
            tokenUsageSummary.replyCount > 0
              ? t('settings.usage.detailConfigured', {
                  count: formatNumber(tokenUsageSummary.replyCount),
                  tokens: formatNumber(tokenUsageSummary.totalTokens)
                })
              : t('settings.usage.detailEmpty')
          }
          helpText={t('settings.usage.help')}
          onClick={onOpenUsage}
        />
      </section>

      <section className="menu-section">
        <div className="menu-section-head">
          <span className="menu-section-kicker">{t('settings.section.appearance')}</span>
        </div>
        <MenuSheetItem
          icon="sparkle"
          title={t('settings.display.title')}
          detail={t('settings.display.detail')}
          onClick={onOpenDisplay}
        />
        <MenuSheetItem
          icon="fontImport"
          title={t('settings.fonts.title')}
          detail={customFontCount > 0 ? t('settings.fonts.detailConfigured', { count: formatNumber(customFontCount) }) : t('settings.fonts.detailEmpty')}
          onClick={onOpenFonts}
        />
      </section>

      <section className="menu-section">
        <div className="menu-section-head">
          <span className="menu-section-kicker">{t('settings.section.documents')}</span>
        </div>
        <MenuSheetItem
          icon="openBook"
          title={t('settings.docs.title')}
          detail={t('settings.docs.detail')}
          helpText={t('settings.docs.help')}
          onClick={onOpenDocs}
        />
      </section>

      <section className="menu-section">
        <div className="menu-section-head">
          <span className="menu-section-kicker">{t('settings.section.data')}</span>
        </div>
        <MenuSheetItem
          icon="folder"
          title={t('settings.backup.title')}
          helpText={t('settings.backup.help')}
          onClick={onOpenBackup}
        />
        <MenuSheetItem
          icon="search"
          title={t('settings.storage.title')}
          detail={
            storageHealthSnapshot
              ? t('settings.storage.detailConfigured', {
                  size: formatNumber(storageHealthSnapshot.totalBytes / 1024 / 1024, { maximumFractionDigits: 1 })
                })
              : t('settings.storage.detailEmpty')
          }
          helpText={t('settings.storage.help')}
          onClick={onOpenStorage}
        />
      </section>

      <section className="menu-section">
        <div className="menu-section-head">
          <span className="menu-section-kicker">{t('settings.section.privacy')}</span>
        </div>
        <MenuSheetItem
          icon="infoCard"
          title={t('settings.privacy.title')}
          helpText={t('settings.privacy.help')}
          onClick={onOpenPrivacy}
        />
      </section>
    </div>
  );
}
