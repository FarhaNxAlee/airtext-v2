import "./style.css";
import { COPY } from "./copy.js";
import { encryptText, decryptItem, keyForCode, storeKey, rememberLinkKey, withKey } from "./encryption.js";
import { rememberDrop, recentDrops, forgetDrop, renderRecentDrops, renderNearbyBoard, addSmartTools, addFileTools, uploadRequest } from "./features.js";

(function () {
      "use strict";

      var APP = window.__AIRTEXT_BOOT__;

      var state = {
        items: [],
        optimisticItems: Object.create(null),
        currentItem: null,
        currentSource: null,
        currentCode: null,
        currentVia: null,
        qrCode: null,
        scanner: null,
        scannerRunning: false,
        pollingTimer: null,
        admin: {
          activeTab: "overview",
          usersById: Object.create(null),
          rolesCache: [],
          drops: { page: 1, pageSize: 25, total: 0, q: "", type: "", filter: "", sort: "newest", selected: Object.create(null) },
          users: { page: 1, pageSize: 25, total: 0, q: "", role: "", status: "" },
          inbox: { tab: "feedback", page: 1, pageSize: 25, total: 0, status: "", pendingApproval: null }
        },
        files: [],
        currentFile: null,
        currentFileCode: null
      };

      var el = {};

      document.addEventListener("DOMContentLoaded", init);

      function init() {
        rememberLinkKey(window.location.href);
        cacheElements();
        bindEvents();
        syncThemeButtons();
        // Shared shell behavior runs once on every route.
        applyPublicSettings();
        highlightActiveNav();
        updateAccountLinkLabel();
        syncWebShareButtonVisibility();
        window.setInterval(updateCountdowns, 1000);
        updateCountdowns();
        initDropFeatures();

        if (APP.initialAdmin) {
          el.publicApp.classList.add("hidden-force");
          el.adminApp.classList.remove("hidden-force");
          initAdmin();
          return;
        }

        if (APP.initialAccount) {
          // /account now renders inside #public-app's shared header/footer
          // (V3 fix) instead of a separate full-screen overlay -- no
          // container toggle needed, just run the account page's own init.
          initAccount();
          return;
        }

        switchTab("share");
        updateCounters();
        loadLocalItems(false);
        loadLocalFiles(false);
        startPolling();
        populateExpiryChoosers();
        startWifiLiveCount();
        bindPasteAnywhere();
        bindDragAnywhere();
        syncWebShareButtonVisibility();

        if (APP.initialShareCode) {
          window.setTimeout(function () {
            openShareByCode(APP.initialShareCode, true, APP.initialShareVia || "link");
          }, 120);
        }
        if (APP.initialFileShareCode) {
          window.setTimeout(function () {
            openFileShareByCode(APP.initialFileShareCode, true, APP.initialShareVia || "link");
          }, 120);
        }

        var focusTarget = new URLSearchParams(window.location.search).get("focus");
        if (focusTarget === "create") {
          window.setTimeout(function () { focusSection("create-card", "share-title"); }, 120);
        } else if (focusTarget === "files") {
          window.setTimeout(function () { focusSection("files-card", "file-title"); }, 120);
        }
      }

      function cacheElements() {
        el.publicApp = document.getElementById("public-app");
        el.adminApp = document.getElementById("admin-app");
        el.accountApp = document.getElementById("account-app");
        el.drawerAuthSlot = document.getElementById("drawer-auth-slot");
        el.accountAvatar = document.getElementById("account-avatar");
        el.accountSigninCard = document.getElementById("account-signin-card");
        el.accountBenefitsCard = document.getElementById("account-benefits-card");
        el.accountDashboard = document.getElementById("account-dashboard");
        el.accountLoginForm = document.getElementById("account-login-form");
        el.accountEmail = document.getElementById("account-email");
        el.accountPassword = document.getElementById("account-password");
        el.accountLoginSubmit = document.getElementById("account-login-submit");
        el.accountLoginError = document.getElementById("account-login-error");
        el.accountLogout = document.getElementById("account-logout");
        el.accountRequestForm = document.getElementById("account-request-form");
        el.accountRequestName = document.getElementById("account-request-name");
        el.accountRequestEmail = document.getElementById("account-request-email");
        el.accountRequestReason = document.getElementById("account-request-reason");
        el.accountRequestSubmit = document.getElementById("account-request-submit");
        el.accountRequestStatus = document.getElementById("account-request-status");
        el.accountDisplayName = document.getElementById("account-display-name");
        el.accountEmailDisplay = document.getElementById("account-email-display");
        el.accountRoleBadge = document.getElementById("account-role-badge");
        el.accountLimitsGrid = document.getElementById("account-limits-grid");
        el.accountNotesList = document.getElementById("account-notes-list");
        el.accountFilesList = document.getElementById("account-files-list");
        el.accountPasswordForm = document.getElementById("account-password-form");
        el.accountCurrentPassword = document.getElementById("account-current-password");
        el.accountNewPassword = document.getElementById("account-new-password");
        el.accountConfirmPassword = document.getElementById("account-confirm-password");
        el.accountPasswordSubmit = document.getElementById("account-password-submit");
        el.accountPasswordStatus = document.getElementById("account-password-status");
        el.createForm = document.getElementById("create-form");
        el.createSubmit = document.getElementById("create-submit");
        el.shareTitle = document.getElementById("share-title");
        el.shareText = document.getElementById("share-text");
        el.lockToggle = document.getElementById("lock-toggle");
        el.pinFieldWrap = document.getElementById("pin-field-wrap");
        el.sharePin = document.getElementById("share-pin");
        el.titleCounter = document.getElementById("title-counter");
        el.textCounter = document.getElementById("text-counter");
        el.lockControl = document.getElementById("lock-control");
        el.burnToggle = document.getElementById("burn-toggle");
        el.customCodeFieldWrap = document.getElementById("custom-code-field-wrap");
        el.customCodeInput = document.getElementById("custom-code-input");
        el.maintenanceBanner = document.getElementById("maintenance-banner");
        el.createExpiryCopy = document.getElementById("create-expiry-copy");
        el.createTtlSelect = document.getElementById("create-ttl-select");

        el.joinForm = document.getElementById("join-form");
        el.joinCode = document.getElementById("join-code");

        el.fileUploadForm = document.getElementById("file-upload-form");
        el.fileUploadSubmit = document.getElementById("file-upload-submit");
        el.fileInput = document.getElementById("file-input");
        el.fileInputName = document.getElementById("file-input-name");
        el.fileTitle = document.getElementById("file-title");
        el.fileLockToggle = document.getElementById("file-lock-toggle");
        el.filePinFieldWrap = document.getElementById("file-pin-field-wrap");
        el.filePin = document.getElementById("file-pin");
        el.fileBurnToggle = document.getElementById("file-burn-toggle");
        el.fileCustomCodeFieldWrap = document.getElementById("file-custom-code-field-wrap");
        el.fileCustomCodeInput = document.getElementById("file-custom-code-input");
        el.fileTtlSelect = document.getElementById("file-ttl-select");
        el.stagedFilesList = document.getElementById("staged-files-list");
        el.stagedFilesTotal = document.getElementById("staged-files-total");
        el.filesDropZone = document.getElementById("files-drop-zone");
        el.filesBoardEmpty = document.getElementById("files-board-empty");
        el.filesBoardList = document.getElementById("files-board-list");
        el.filesRefreshButton = document.getElementById("files-refresh-button");

        el.fileModal = document.getElementById("file-modal");
        el.fileModalLoading = document.getElementById("file-modal-loading");
        el.fileModalError = document.getElementById("file-modal-error");
        el.fileModalTitle = document.getElementById("file-modal-title");
        el.fileModalLockBadge = document.getElementById("file-modal-lock-badge");
        el.fileModalExpiry = document.getElementById("file-modal-expiry");
        el.fileUnlockForm = document.getElementById("file-unlock-form");
        el.fileUnlockPin = document.getElementById("file-unlock-pin");
        el.fileUnlockSubmit = document.getElementById("file-unlock-submit");
        el.fileModalContent = document.getElementById("file-modal-content");
        el.fileModalSharedBy = document.getElementById("file-modal-shared-by");
        el.fileModalList = document.getElementById("file-modal-list");
        el.deleteFileButton = document.getElementById("delete-file-button");
        el.editFileButton = document.getElementById("edit-file-button");

        el.editFileModal = document.getElementById("edit-file-modal");
        el.editFileForm = document.getElementById("edit-file-form");
        el.editFileError = document.getElementById("edit-file-error");
        el.editFileTitle = document.getElementById("edit-file-title");
        el.editFileExistingList = document.getElementById("edit-file-existing-list");
        el.editFileInput = document.getElementById("edit-file-input");
        el.editFileStagedList = document.getElementById("edit-file-staged-list");
        el.editFileLockToggle = document.getElementById("edit-file-lock-toggle");
        el.editFilePinFieldWrap = document.getElementById("edit-file-pin-field-wrap");
        el.editFilePin = document.getElementById("edit-file-pin");
        el.editFileBurnToggle = document.getElementById("edit-file-burn-toggle");
        el.editFileTtlSelect = document.getElementById("edit-file-ttl-select");
        el.editFileSubmit = document.getElementById("edit-file-submit");

        el.qrtoolForm = document.getElementById("qrtool-form");
        el.qrtoolInput = document.getElementById("qrtool-input");
        el.qrtoolOutputWrap = document.getElementById("qrtool-output-wrap");
        el.qrtoolOutput = document.getElementById("qrtool-output");

        el.mainTabs = document.querySelectorAll("#main-tabs [data-tab]");
        el.tabPanels = document.querySelectorAll("[data-tab-panel]");
        el.mainTabAvailableCount = document.getElementById("main-tab-available-count");
        el.boardClock = document.getElementById("board-clock");

        el.boardLoading = document.getElementById("board-loading");
        el.boardEmpty = document.getElementById("board-empty");
        el.boardList = document.getElementById("board-list");
        el.itemCount = document.getElementById("item-count");
        el.lastRefreshed = document.getElementById("last-refreshed");
        el.refreshButton = document.getElementById("refresh-button");
        el.notesSearch = document.getElementById("notes-search");
        el.notesFilter = document.getElementById("notes-filter");

        el.itemModal = document.getElementById("item-modal");
        el.modalLoading = document.getElementById("modal-loading");
        el.modalError = document.getElementById("modal-error");
        el.modalTitle = document.getElementById("modal-title");
        el.modalLockBadge = document.getElementById("modal-lock-badge");
        el.modalExpiry = document.getElementById("modal-expiry");
        el.unlockForm = document.getElementById("unlock-form");
        el.unlockPin = document.getElementById("unlock-pin");
        el.unlockSubmit = document.getElementById("unlock-submit");
        el.modalContent = document.getElementById("modal-content");
        el.modalText = document.getElementById("modal-text");
        el.modalSharedBy = document.getElementById("modal-shared-by");
        el.deleteButton = document.getElementById("delete-item-button");
        el.editItemButton = document.getElementById("edit-item-button");

        el.editItemModal = document.getElementById("edit-item-modal");
        el.editItemForm = document.getElementById("edit-item-form");
        el.editItemError = document.getElementById("edit-item-error");
        el.editItemTitle = document.getElementById("edit-item-title");
        el.editItemText = document.getElementById("edit-item-text");
        el.editItemLockToggle = document.getElementById("edit-item-lock-toggle");
        el.editItemPinFieldWrap = document.getElementById("edit-item-pin-field-wrap");
        el.editItemPin = document.getElementById("edit-item-pin");
        el.editItemBurnToggle = document.getElementById("edit-item-burn-toggle");
        el.editItemTtlSelect = document.getElementById("edit-item-ttl-select");
        el.editItemSubmit = document.getElementById("edit-item-submit");

        el.qrModal = document.getElementById("qr-modal");
        el.qrOutput = document.getElementById("qr-output");
        el.qrCodeText = document.getElementById("qr-code-text");
        el.qrLinkInput = document.getElementById("qr-link-input");
        el.webShareButton = document.getElementById("web-share-button");

        el.wifiLiveCount = document.getElementById("wifi-live-count");

        el.scannerModal = document.getElementById("scanner-modal");
        el.scannerStatus = document.getElementById("scanner-status");

        el.drawer = document.getElementById("side-drawer");
        el.drawerBackdrop = document.getElementById("drawer-backdrop");
        el.feedbackSection = document.getElementById("feedback-drawer-section");
        el.feedbackForm = document.getElementById("feedback-form");
        el.feedbackCategory = document.getElementById("feedback-category");
        el.feedbackMessage = document.getElementById("feedback-message");
        el.feedbackEmail = document.getElementById("feedback-email");
        el.feedbackRating = document.getElementById("feedback-rating");
        el.feedbackSubmit = document.getElementById("feedback-submit");

        el.adminUsers = document.getElementById("admin-users-list");
        el.adminUsersPagination = document.getElementById("admin-users-pagination");
        el.adminUsersSearch = document.getElementById("admin-users-search");
        el.adminUsersRoleFilter = document.getElementById("admin-users-role-filter");
        el.adminUsersStatusFilter = document.getElementById("admin-users-status-filter");
        el.adminRoles = document.getElementById("admin-roles");
        el.adminUserCreateForm = document.getElementById("admin-user-create-form");
        el.newUserEmail = document.getElementById("new-user-email");
        el.newUserName = document.getElementById("new-user-name");
        el.newUserPassword = document.getElementById("new-user-password");
        el.newUserRole = document.getElementById("new-user-role");
        el.adminUserCreateSubmit = document.getElementById("admin-user-create-submit");
        el.adminUserCreateSection = document.getElementById("admin-user-create-section");

        el.adminLoginHeader = document.getElementById("admin-login-header");
        el.adminLoginCard = document.getElementById("admin-login-card");
        el.adminLoginHelp = document.getElementById("admin-login-help");
        el.adminLoginForm = document.getElementById("admin-login-form");
        el.adminEmail = document.getElementById("admin-email");
        el.adminPassword = document.getElementById("admin-password");
        el.adminLoginSubmit = document.getElementById("admin-login-submit");
        el.adminDashboard = document.getElementById("admin-dashboard");
        el.adminLogout = document.getElementById("admin-logout");
        el.adminRefresh = document.getElementById("admin-refresh");
        el.adminSearch = document.getElementById("admin-search");
        el.adminKpis = document.getElementById("admin-kpis");
        el.adminAttention = document.getElementById("admin-attention");
        el.adminActivityFeed = document.getElementById("admin-activity-feed");
        el.adminTrendChart = document.getElementById("admin-trend-chart");
        el.adminInboxBadge = document.getElementById("admin-inbox-badge");
        el.adminHealthD1 = document.getElementById("admin-health-d1");
        el.adminHealthR2 = document.getElementById("admin-health-r2");
        el.adminSettingsForm = document.getElementById("admin-settings-form");
        el.adminSettingsSubmit = document.getElementById("admin-settings-submit");

        el.adminDropsList = document.getElementById("admin-drops-list");
        el.adminDropsPagination = document.getElementById("admin-drops-pagination");
        el.adminDropsSearch = document.getElementById("admin-drops-search");
        el.adminDropsTypeFilter = document.getElementById("admin-drops-type-filter");
        el.adminDropsStatusFilter = document.getElementById("admin-drops-status-filter");
        el.adminDropsSort = document.getElementById("admin-drops-sort");
        el.adminDropsBulkDelete = document.getElementById("admin-drops-bulk-delete");
        el.adminDropsSelectAll = document.getElementById("admin-drops-select-all");

        el.adminInboxList = document.getElementById("admin-inbox-list");
        el.adminInboxPagination = document.getElementById("admin-inbox-pagination");
        el.adminInboxCounts = document.getElementById("admin-inbox-counts");
        el.adminInboxStatusFilter = document.getElementById("admin-inbox-status-filter");
        el.adminInboxTabs = document.querySelectorAll("[data-inbox-tab]");

        el.adminSettingsSubtabs = document.querySelectorAll("[data-settings-subtab]");
        el.adminSettingsPanels = document.querySelectorAll("[data-settings-panel]");

        el.adminStorageBar = document.getElementById("admin-storage-bar");
        el.adminStorageFill = document.getElementById("admin-storage-fill");
        el.adminStorageLabel = document.getElementById("admin-storage-label");
        el.adminStorageWarning = document.getElementById("admin-storage-warning");
        el.adminTabs = document.querySelectorAll("[data-admin-tab]");
        el.adminTabPanels = document.querySelectorAll("[data-admin-panel]");
        el.adminContentFieldsGeneral = document.getElementById("admin-content-fields-general");
        el.adminContentFieldsLimits = document.getElementById("admin-content-fields-limits");
        el.adminContentFieldsContent = document.getElementById("admin-content-fields-content");
        el.adminContentFieldsSeo = document.getElementById("admin-content-fields-seo");

        el.settingAppName = document.getElementById("setting-app-name");
        el.settingTagline = document.getElementById("setting-tagline");
        el.settingAnnouncement = document.getElementById("setting-announcement");
        el.settingTtl = document.getElementById("setting-ttl");
        el.settingMaxItems = document.getElementById("setting-max-items");
        el.settingTitleLength = document.getElementById("setting-title-length");
        el.settingTextLength = document.getElementById("setting-text-length");
        el.settingCreateCooldown = document.getElementById("setting-create-cooldown");
        el.settingUnlockCooldown = document.getElementById("setting-unlock-cooldown");
        el.settingDefaultTheme = document.getElementById("setting-default-theme");
        el.settingNotesEnabled = document.getElementById("setting-notes-enabled");
        el.settingPinEnabled = document.getElementById("setting-pin-enabled");
        el.settingCrossNetwork = document.getElementById("setting-cross-network");
        el.settingFeedbackEnabled = document.getElementById("setting-feedback-enabled");
        el.settingAnalyticsEnabled = document.getElementById("setting-analytics-enabled");
        el.settingMaintenance = document.getElementById("setting-maintenance");
        el.settingAnnouncementEnabled = document.getElementById("setting-announcement-enabled");

        // /login (V3 unified front door -- separate from the /account
        // section's own sign-in form, since it redirects instead of
        // switching to a dashboard in place).
        el.loginForm = document.getElementById("login-form");
        el.loginEmail = document.getElementById("login-email");
        el.loginPassword = document.getElementById("login-password");
        el.loginSubmit = document.getElementById("login-submit");
        el.loginError = document.getElementById("login-error");
        el.loginAdminHint = document.getElementById("login-admin-hint");
      }

      function bindEvents() {
        el.mainTabs.forEach(function (tab) {
          tab.addEventListener("click", function () { switchTab(tab.getAttribute("data-tab")); });
        });
        if (el.createForm) el.createForm.addEventListener("submit", createShare);
        if (el.joinForm) {
          el.joinForm.addEventListener("submit", function (event) {
            event.preventDefault();
            receiveValue(el.joinCode.value);
          });
        }
        if (el.unlockForm) el.unlockForm.addEventListener("submit", unlockCurrentItem);
        if (el.editItemForm) el.editItemForm.addEventListener("submit", saveItemEdit);
        if (el.editItemLockToggle) {
          el.editItemLockToggle.addEventListener("change", function () {
            if (state.editTarget) state.editTarget.lockTouched = true;
            if (el.editItemPinFieldWrap) el.editItemPinFieldWrap.classList.toggle("hidden", !el.editItemLockToggle.checked);
            if (el.editItemLockToggle.checked) window.setTimeout(function () { if (el.editItemPin) el.editItemPin.focus(); }, 60);
            else if (el.editItemPin) el.editItemPin.value = "";
          });
        }
        if (el.editItemBurnToggle) {
          el.editItemBurnToggle.addEventListener("change", function () {
            if (state.editTarget) state.editTarget.burnTouched = true;
          });
        }
        if (el.editFileForm) el.editFileForm.addEventListener("submit", saveFileEdit);
        if (el.editFileLockToggle) {
          el.editFileLockToggle.addEventListener("change", function () {
            if (state.editTarget) state.editTarget.lockTouched = true;
            if (el.editFilePinFieldWrap) el.editFilePinFieldWrap.classList.toggle("hidden", !el.editFileLockToggle.checked);
            if (el.editFileLockToggle.checked) window.setTimeout(function () { if (el.editFilePin) el.editFilePin.focus(); }, 60);
            else if (el.editFilePin) el.editFilePin.value = "";
          });
        }
        if (el.editFileBurnToggle) {
          el.editFileBurnToggle.addEventListener("change", function () {
            if (state.editTarget) state.editTarget.burnTouched = true;
          });
        }
        if (el.editFileInput) el.editFileInput.addEventListener("change", function () { renderEditFileStagedList(); });
        if (el.feedbackForm) el.feedbackForm.addEventListener("submit", submitFeedback);
        if (el.notesSearch) el.notesSearch.addEventListener("input", renderLocalItems);
        if (el.notesFilter) el.notesFilter.addEventListener("change", renderLocalItems);
        if (el.fileUploadForm) el.fileUploadForm.addEventListener("submit", createFileShare);
        if (el.fileUnlockForm) el.fileUnlockForm.addEventListener("submit", unlockCurrentFile);
        if (el.fileLockToggle) {
          el.fileLockToggle.addEventListener("change", function () {
            if (el.filePinFieldWrap) el.filePinFieldWrap.classList.toggle("hidden", !el.fileLockToggle.checked);
            if (el.fileLockToggle.checked) window.setTimeout(function () { if (el.filePin) el.filePin.focus(); }, 60);
            else if (el.filePin) el.filePin.value = "";
          });
        }
        if (el.fileInput) el.fileInput.addEventListener("change", function () { renderStagedFiles(); });
        if (el.filesDropZone) {
          el.filesDropZone.addEventListener("dragover", function (event) { event.preventDefault(); });
          el.filesDropZone.addEventListener("drop", function (event) {
            event.preventDefault();
            var dropped = event.dataTransfer && event.dataTransfer.files;
            if (dropped && dropped.length && el.fileInput) {
              el.fileInput.files = dropped;
              renderStagedFiles();
            }
          });
        }
        if (el.filesRefreshButton) el.filesRefreshButton.addEventListener("click", function () { loadLocalFiles(true); });
        if (el.qrtoolForm) el.qrtoolForm.addEventListener("submit", generateLinkQrTool);
        if (el.adminLoginForm) el.adminLoginForm.addEventListener("submit", adminLogin);
        if (el.adminSettingsForm) el.adminSettingsForm.addEventListener("submit", saveAdminSettings);
        if (el.adminLogout) el.adminLogout.addEventListener("click", adminLogout);
        if (el.adminRefresh) el.adminRefresh.addEventListener("click", function () { loadAdminOverview(); });
        el.adminTabs.forEach(function (tab) {
          tab.addEventListener("click", function () {
            var name = tab.getAttribute("data-admin-tab");
            switchAdminTab(name);
            loadAdminTabData(name);
          });
        });
        el.adminSettingsSubtabs.forEach(function (tab) {
          tab.addEventListener("click", function () { switchSettingsSubtab(tab.getAttribute("data-settings-subtab")); });
        });
        el.adminInboxTabs.forEach(function (tab) {
          tab.addEventListener("click", function () {
            state.admin.inbox.tab = tab.getAttribute("data-inbox-tab");
            state.admin.inbox.page = 1;
            switchInboxSubtab(state.admin.inbox.tab);
            loadAdminInbox();
          });
        });
        if (el.adminUserCreateForm) el.adminUserCreateForm.addEventListener("submit", createAdminUser);

        if (el.adminSearch) {
          el.adminSearch.addEventListener("input", debounce(function () {
            handleAdminTopSearch(el.adminSearch.value.trim());
          }, 250));
        }
        if (el.adminDropsSearch) {
          el.adminDropsSearch.addEventListener("input", debounce(function () {
            state.admin.drops.q = el.adminDropsSearch.value.trim();
            state.admin.drops.page = 1;
            loadAdminDrops();
          }, 250));
        }
        if (el.adminDropsTypeFilter) {
          el.adminDropsTypeFilter.addEventListener("change", function () {
            state.admin.drops.type = el.adminDropsTypeFilter.value;
            state.admin.drops.page = 1;
            loadAdminDrops();
          });
        }
        if (el.adminDropsStatusFilter) {
          el.adminDropsStatusFilter.addEventListener("change", function () {
            state.admin.drops.filter = el.adminDropsStatusFilter.value;
            state.admin.drops.page = 1;
            loadAdminDrops();
          });
        }
        if (el.adminDropsSort) {
          el.adminDropsSort.addEventListener("change", function () {
            state.admin.drops.sort = el.adminDropsSort.value;
            state.admin.drops.page = 1;
            loadAdminDrops();
          });
        }
        if (el.adminDropsBulkDelete) el.adminDropsBulkDelete.addEventListener("click", submitDropsBulkDelete);
        if (el.adminDropsSelectAll) el.adminDropsSelectAll.addEventListener("change", function () {
          toggleSelectAllDrops(el.adminDropsSelectAll.checked);
        });

        if (el.adminUsersSearch) {
          el.adminUsersSearch.addEventListener("input", debounce(function () {
            state.admin.users.q = el.adminUsersSearch.value.trim();
            state.admin.users.page = 1;
            loadAdminUsersPage();
          }, 250));
        }
        if (el.adminUsersRoleFilter) {
          el.adminUsersRoleFilter.addEventListener("change", function () {
            state.admin.users.role = el.adminUsersRoleFilter.value;
            state.admin.users.page = 1;
            loadAdminUsersPage();
          });
        }
        if (el.adminUsersStatusFilter) {
          el.adminUsersStatusFilter.addEventListener("change", function () {
            state.admin.users.status = el.adminUsersStatusFilter.value;
            state.admin.users.page = 1;
            loadAdminUsersPage();
          });
        }
        if (el.adminInboxStatusFilter) {
          el.adminInboxStatusFilter.addEventListener("change", function () {
            state.admin.inbox.status = el.adminInboxStatusFilter.value;
            state.admin.inbox.page = 1;
            loadAdminInbox();
          });
        }
        if (el.accountLoginForm) el.accountLoginForm.addEventListener("submit", accountLogin);
        if (el.accountLogout) el.accountLogout.addEventListener("click", accountLogout);
        if (el.accountRequestForm) el.accountRequestForm.addEventListener("submit", submitAccountRequest);
        if (el.accountPasswordForm) el.accountPasswordForm.addEventListener("submit", changeAccountPassword);
        if (el.loginForm) el.loginForm.addEventListener("submit", submitLoginPage);

        if (el.shareTitle) el.shareTitle.addEventListener("input", updateCounters);
        if (el.shareText) el.shareText.addEventListener("input", updateCounters);
        if (el.lockToggle) {
          el.lockToggle.addEventListener("change", function () {
            if (el.pinFieldWrap) el.pinFieldWrap.classList.toggle("hidden", !el.lockToggle.checked);
            if (el.lockToggle.checked) window.setTimeout(function () { if (el.sharePin) el.sharePin.focus(); }, 60);
            else if (el.sharePin) el.sharePin.value = "";
          });
        }
        if (el.joinCode) {
          el.joinCode.addEventListener("input", function () {
            if (!/https?:\/\//i.test(el.joinCode.value)) el.joinCode.value = normalizeCode(el.joinCode.value);
          });
        }

        if (el.joinCode) el.joinCode.addEventListener("paste", function (event) {
          var text = event.clipboardData && event.clipboardData.getData("text");
          if (text && /^https?:\/\//i.test(text.trim())) { event.preventDefault(); receiveValue(text); }
        });
        // Nav dropdowns (Send / Nearby-Receive / Tools / Help / avatar) are
        // plain <details> elements -- close any others when one opens, and
        // close them all when clicking outside, so only one is open at a time.
        document.querySelectorAll("details.nav-dropdown").forEach(function (node) {
          node.addEventListener("toggle", function () {
            if (!node.open) return;
            document.querySelectorAll("details.nav-dropdown[open]").forEach(function (other) {
              if (other !== node) other.removeAttribute("open");
            });
          });
        });
        document.addEventListener("click", function (event) {
          document.querySelectorAll("details.nav-dropdown[open]").forEach(function (node) {
            if (!node.contains(event.target)) node.removeAttribute("open");
          });
        });

        document.addEventListener("click", function (event) {
          var actionElement = event.target.closest("[data-action]");
          if (!actionElement) return;
          var action = actionElement.getAttribute("data-action");

          if (action === "focus-create") focusSection("create-card", "share-title");
          if (action === "focus-join") focusSection("join-card", "join-code");
          if (action === "focus-notes") focusSection("notes-section", "notes-search");
          if (action === "focus-files") focusSection("files-card", "file-title");
          if (action === "refresh-items") { loadLocalItems(true); loadLocalFiles(false); }
          if (action === "refresh-files") loadLocalFiles(true);
          if (action === "open-scanner") {
            if (el.drawer.classList.contains("open")) closeDrawer();
            openScanner();
          }
          if (action === "close-scanner") closeScanner();
          if (action === "close-item-modal") closeItemModal();
          if (action === "close-file-modal") closeFileModal();
          if (action === "close-qr-modal") closeQrModal();
          if (action === "open-edit-item-modal" && state.currentItem) openEditItemModal(state.currentItem.id, "anonymous", state.currentItem);
          if (action === "close-edit-item-modal") closeEditItemModal();
          if (action === "open-edit-file-modal" && state.currentFile) openEditFileModal(state.currentFile.id, "anonymous", state.currentFile);
          if (action === "close-edit-file-modal") closeEditFileModal();
          var removeEditFileId = actionElement.getAttribute("data-remove-file-id");
          if (action === "remove-edit-file" && removeEditFileId) toggleEditFileRemoval(removeEditFileId);
          if (action === "toggle-create-pin") togglePassword(el.sharePin);
          if (action === "copy-text") copyText(state.currentItem && state.currentItem.text, "Text copied.");
          if (action === "show-current-qr") showQrForCurrentItem();
          if (action === "show-current-file-qr") showQrForCurrentFile();
          if (action === "download-qrtool") downloadQrToolPng();
          if (action === "copy-link") copyText(el.qrLinkInput.value, "Share link copied.");
          if (action === "copy-code") copyText(el.qrCodeText.textContent, "Share code copied.");
          if (action === "delete-current-item") deleteCurrentItem();
          if (action === "delete-current-file") deleteCurrentFile();
          if (action === "toggle-theme") toggleTheme();
          if (action === "open-drawer") openDrawer();
          if (action === "open-drawer-section") {
            openDrawer(actionElement.getAttribute("data-drawer-target"));
          }
          if (action === "close-drawer") closeDrawer();
          if (action === "refresh-page") window.location.reload();
          if (action === "nav-sign-out") signOutFromNav();
          if (action === "quick-share-tab") activateQuickShareTab(actionElement.getAttribute("data-quick-tab"));
          if (action === "how-it-works-tab") activateHowItWorksTab(actionElement.getAttribute("data-how-tab"));
          if (action === "web-share") doWebShare();

          var itemId = actionElement.getAttribute("data-item-id");
          if (action === "open-local-item" && itemId) openLocalItem(itemId);
          if (action === "share-local-item" && itemId) showQrForListItem(itemId);

          var fileId = actionElement.getAttribute("data-file-id");
          if (action === "open-local-file" && fileId) openLocalFile(fileId);
          if (action === "share-local-file" && fileId) showQrForListFile(fileId);

          var feedbackId = actionElement.getAttribute("data-feedback-id");
          if (action === "admin-feedback-status" && feedbackId) {
            updateFeedbackStatus(feedbackId, actionElement.getAttribute("data-feedback-status"));
          }
          if (action === "admin-delete-feedback" && feedbackId) deleteFeedback(feedbackId);
          if (action === "admin-approve-request" && feedbackId) {
            approveAccountRequest(actionElement.getAttribute("data-name"), actionElement.getAttribute("data-email"));
          }

          var targetUserId = actionElement.getAttribute("data-user-id");
          if (action === "admin-toggle-user-status" && targetUserId) {
            toggleUserStatus(targetUserId, actionElement.getAttribute("data-user-status"));
          }
          if (action === "admin-delete-user" && targetUserId) deleteAdminUser(targetUserId);
          if (action === "admin-toggle-user-limits" && targetUserId) toggleUserLimitsForm(targetUserId);
          if (action === "admin-save-user-limits" && targetUserId) saveUserLimits(targetUserId);
          if (action === "admin-toggle-user-edit" && targetUserId) toggleUserEditForm(targetUserId);
          if (action === "admin-save-user-edit" && targetUserId) saveUserEdit(targetUserId);

          var targetRoleId = actionElement.getAttribute("data-role-id");
          if (action === "admin-save-role" && targetRoleId) saveRole(targetRoleId);

          var dropType = actionElement.getAttribute("data-drop-type");
          var dropId = actionElement.getAttribute("data-drop-id");
          if (action === "admin-delete-drop" && dropType && dropId) adminDeleteDrop(dropType, dropId);
          if (action === "admin-edit-drop" && dropType && dropId) {
            if (dropType === "file") openEditFileModal(dropId, "admin", { id: dropId, title: actionElement.getAttribute("data-drop-title") || "" });
            else openEditItemModal(dropId, "admin", { id: dropId, title: actionElement.getAttribute("data-drop-title") || "" });
          }
          if (action === "admin-drops-select-all") toggleSelectAllDrops(actionElement.checked);
          if (action === "admin-drops-select-row" && dropType && dropId) {
            toggleDropSelection(dropType, dropId, actionElement.checked);
          }
          if (action === "admin-drops-page-prev") changeDropsPage(-1);
          if (action === "admin-drops-page-next") changeDropsPage(1);
          if (action === "admin-users-page-prev") changeUsersPage(-1);
          if (action === "admin-users-page-next") changeUsersPage(1);
          if (action === "admin-inbox-page-prev") changeInboxPage(-1);
          if (action === "admin-inbox-page-next") changeInboxPage(1);
          if (action === "admin-goto-tab") {
            var gotoTab = actionElement.getAttribute("data-admin-goto");
            if (gotoTab) {
              switchAdminTab(gotoTab);
              loadAdminTabData(gotoTab);
              if (gotoTab === "inbox" && actionElement.getAttribute("data-inbox-goto")) {
                state.admin.inbox.tab = actionElement.getAttribute("data-inbox-goto");
                switchInboxSubtab(state.admin.inbox.tab);
                loadAdminInbox();
              }
            }
          }

          var accountNoteId = actionElement.getAttribute("data-account-note-id");
          if (action === "account-delete-note" && accountNoteId) deleteAccountNote(accountNoteId);
          if (action === "account-edit-note" && accountNoteId) editAccountNote(accountNoteId);
          if (action === "account-share-note" && accountNoteId) shareAccountNoteToNetwork(accountNoteId);
          if (action === "account-qr-note" && accountNoteId) {
            showQr(actionElement.getAttribute("data-code"), window.location.origin + "/s/" + actionElement.getAttribute("data-code"));
          }
          var accountFileId = actionElement.getAttribute("data-account-file-id");
          if (action === "account-delete-file" && accountFileId) deleteAccountFile(accountFileId);
          if (action === "account-edit-file" && accountFileId) editAccountFile(accountFileId);
          if (action === "account-share-file" && accountFileId) shareAccountFileToNetwork(accountFileId);
          if (action === "account-qr-file" && accountFileId) {
            showQr(actionElement.getAttribute("data-code"), window.location.origin + "/f/" + actionElement.getAttribute("data-code"));
          }
          if (action === "account-copy-note") {
            copyText(window.location.origin + "/s/" + actionElement.getAttribute("data-code"), "Share link copied.");
          }
          if (action === "account-copy-file") {
            copyText(window.location.origin + "/f/" + actionElement.getAttribute("data-code"), "Share link copied.");
          }
        });

        [el.itemModal, el.fileModal, el.editItemModal, el.editFileModal, el.qrModal, el.scannerModal].forEach(function (modal) {
          modal.addEventListener("click", function (event) {
            if (event.target !== modal) return;
            if (modal === el.itemModal) closeItemModal();
            if (modal === el.fileModal) closeFileModal();
            if (modal === el.editItemModal) closeEditItemModal();
            if (modal === el.editFileModal) closeEditFileModal();
            if (modal === el.qrModal) closeQrModal();
            if (modal === el.scannerModal) closeScanner();
          });
        });

        document.addEventListener("keydown", function (event) {
          if (event.key !== "Escape") return;
          if (!el.scannerModal.classList.contains("hidden")) closeScanner();
          else if (!el.qrModal.classList.contains("hidden")) closeQrModal();
          else if (!el.editItemModal.classList.contains("hidden")) closeEditItemModal();
          else if (!el.editFileModal.classList.contains("hidden")) closeEditFileModal();
          else if (!el.fileModal.classList.contains("hidden")) closeFileModal();
          else if (!el.itemModal.classList.contains("hidden")) closeItemModal();
          else if (el.drawer.classList.contains("open")) closeDrawer();
        });
      }

      async function createShare(event) {
        event.preventDefault();
        if (APP.maintenanceMode || !APP.notesEnabled) {
          return toast("New notes are currently disabled.", "error");
        }

        var title = el.shareTitle.value.trim();
        var text = el.shareText.value.trim();
        var locked = APP.pinEnabled && el.lockToggle.checked;
        var pin = el.sharePin.value.trim();
        var burnAfterRead = el.burnToggle.checked;
        var wantsEncryption = APP.allowClientEncryption && document.getElementById("encrypt-note-toggle") && document.getElementById("encrypt-note-toggle").checked;
        var customCode = APP.allowCustomCode ? el.customCodeInput.value.trim() : "";
        var ttlSeconds = el.createTtlSelect && el.createTtlSelect.value ? Number(el.createTtlSelect.value) : undefined;

        if (!title) return fieldError(el.shareTitle, "Add a title.");
        if (!text) return fieldError(el.shareText, "Add some text to share.");
        if (locked && (pin.length < APP.minPinLength || pin.length > APP.maxPinLength)) {
          return fieldError(el.sharePin, "PIN must be " + APP.minPinLength + "–" + APP.maxPinLength + " characters.");
        }

        setButtonLoading(el.createSubmit, true, "Creating share…");

        try {
          var envelope = wantsEncryption ? await encryptText(text) : null;
          var response = await apiFetch("/api/items", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              title: title, text: envelope ? envelope.text : text, locked: locked, pin: pin,
              encrypted: Boolean(envelope), encryptionIv: envelope && envelope.encryptionIv, encryptionVersion: envelope && envelope.encryptionVersion,
              burnAfterRead: burnAfterRead, customCode: customCode, ttlSeconds: ttlSeconds
            })
          });

          saveDeleteToken(response.item.id, response.deleteToken);
          if (envelope) storeKey(response.item.code, envelope.key);
          rememberDrop("note", response.item);
          refreshRecentDrops();
          if (!response.item.burnAfterRead && !response.item.encrypted) upsertLocalItem(response.item, true);
          renderLocalItems();
          if (el.lastRefreshed) el.lastRefreshed.textContent = "Added just now";
          resetCreateForm();
          showQr(response.item.code, response.shareUrl);
          toast("Note created instantly. It expires in " + formatDuration(APP.ttlSeconds) + ".", "success");
        } catch (error) {
          toast(error.message || "Unable to create share.", "error");
        } finally {
          setButtonLoading(el.createSubmit, false, COPY.createButtonText);
        }
      }

      async function loadLocalItems(showFeedback) {
        if (!el.boardList || !el.refreshButton) return;
        if (el.refreshButton.disabled) return;
        el.refreshButton.disabled = true;
        var icon = el.refreshButton.querySelector("[data-refresh-icon]");
        if (icon) icon.classList.add("animate-spin");

        try {
          var response = await apiFetch("/api/local/items");
          state.items = reconcileLocalItems(Array.isArray(response.items) ? response.items : []);
          renderLocalItems();
          el.lastRefreshed.textContent = "Updated " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          if (showFeedback) toast("Local board refreshed.", "success");
        } catch (error) {
          el.boardLoading.classList.add("hidden");
          if (showFeedback || state.items.length === 0) toast(error.message || "Unable to load the local board.", "error");
        } finally {
          el.refreshButton.disabled = false;
          if (icon) icon.classList.remove("animate-spin");
        }
      }

      function renderLocalItems() {
        renderNearby();
        if (!el.boardList) return;
        var now = Date.now();
        state.items = state.items.filter(function (item) { return Number(item.expiresAt) > now; });
        var query = String(el.notesSearch.value || "").trim().toLowerCase();
        var filter = el.notesFilter.value || "all";
        var visibleItems = state.items.filter(function (item) {
          var matchesText = !query || String(item.title || "").toLowerCase().indexOf(query) !== -1 ||
            String(item.code || "").toLowerCase().indexOf(query) !== -1;
          var matchesFilter = filter === "all" ||
            (filter === "mine" && (item.isOwner || getDeleteToken(item.id))) ||
            (filter === "received" && item.source === "received") ||
            (filter === "open" && !item.locked) ||
            (filter === "locked" && item.locked);
          return matchesText && matchesFilter;
        });

        el.boardLoading.classList.add("hidden");
        el.itemCount.textContent = state.items.length + (state.items.length === 1 ? " item" : " items");
        updateActiveCountBadge();
        el.boardList.textContent = "";

        if (visibleItems.length === 0) {
          el.boardList.classList.add("hidden");
          el.boardEmpty.classList.remove("hidden");
          var emptyText = el.boardEmpty.querySelector("p");
          if (emptyText) emptyText.textContent = state.items.length ? "No notes match this view." : COPY.availableEmptyText;
          return;
        }

        el.boardEmpty.classList.add("hidden");
        el.boardList.classList.remove("hidden");

        visibleItems.forEach(function (item) {
          var card = document.createElement("article");
          card.className = "note-row";

          var titleWrap = document.createElement("div");
          titleWrap.className = "note-main";

          var meta = document.createElement("div");
          meta.className = "note-meta";
          var sourceBadge = document.createElement("span");
          sourceBadge.className = "note-badge " + (item.source === "received" ? "badge-received" : "badge-mine");
          sourceBadge.textContent = item.isOwner || getDeleteToken(item.id) || getDeleteToken("file:" + item.id) ? "Mine" : "Nearby";
          var lockBadge = document.createElement("span");
          lockBadge.className = "note-badge" + (item.locked ? " badge-locked" : "");
          lockBadge.textContent = item.locked ? "PIN locked" : "Open";
          meta.appendChild(sourceBadge);
          meta.appendChild(lockBadge);
          if (item.burnAfterRead) {
            var burnBadge = document.createElement("span");
            burnBadge.className = "note-badge badge-burn";
            burnBadge.textContent = "Open once";
            meta.appendChild(burnBadge);
          }
          var sharedByBadge = buildSharedByBadge(item.sharedBy, card);
          if (sharedByBadge) meta.appendChild(sharedByBadge);

          var title = document.createElement("h3");
          title.className = "note-title";
          title.textContent = item.title;

          var expiry = document.createElement("span");
          expiry.className = "note-expiry";
          expiry.setAttribute("data-expires", String(item.expiresAt));
          expiry.textContent = formatRemaining(item.expiresAt);

          titleWrap.appendChild(meta);
          titleWrap.appendChild(title);
          titleWrap.appendChild(expiry);

          var actions = document.createElement("div");
          actions.className = "note-actions";

          var openButton = document.createElement("button");
          openButton.type = "button";
          openButton.setAttribute("data-action", "open-local-item");
          openButton.setAttribute("data-item-id", item.id);
          openButton.className = "primary-action px-4 py-2 text-xs font-semibold";
          openButton.textContent = item.locked ? "Enter PIN" : "Open";

          var qrButton = document.createElement("button");
          qrButton.type = "button";
          qrButton.setAttribute("data-action", "share-local-item");
          qrButton.setAttribute("data-item-id", item.id);
          qrButton.className = "icon-button";
          qrButton.setAttribute("aria-label", "Show share code and QR");
          qrButton.innerHTML = '<svg viewBox="0 0 24 24" class="h-4 w-4"><use href="#i-qr-grid"></use></svg>';

          actions.appendChild(openButton);
          actions.appendChild(qrButton);
          card.appendChild(titleWrap);
          card.appendChild(actions);
          el.boardList.appendChild(card);
        });
      }

      async function openLocalItem(itemId) {
        state.currentSource = "local";
        state.currentCode = null;
        state.currentVia = "network";
        openItemModal();

        try {
          var response = await apiFetch("/api/local/item/" + encodeURIComponent(itemId));
          showItemResponse(response.item, "local", null);
        } catch (error) {
          showModalError(error.message || "Unable to open this item.");
        }
      }

      async function openAnyShareByCode(rawCode, updateUrl, via) {
        var code = normalizeCode(rawCode);
        if (!code) return toast("Invalid share code.", "error");
        try {
          var probe = await apiFetch("/api/share/" + encodeURIComponent(code) + "?via=" + encodeURIComponent(via || "link"));
          state.currentSource = "share";
          state.currentCode = code;
          state.currentVia = via;
          el.joinCode.value = code;
          openItemModal();
          if (updateUrl && window.location.pathname !== "/s/" + code) {
            window.history.pushState({}, "", withKey(window.location.origin + "/s/" + code));
          }
          showItemResponse(probe.item, "share", code);
        } catch (error) {
          if (error.code === "CODE_NOT_FOUND") {
            return openFileShareByCode(code, updateUrl, via);
          }
          state.currentSource = "share";
          state.currentCode = code;
          el.joinCode.value = code;
          openItemModal();
          showModalError(error.message || "Unable to open this share code.");
        }
      }

      async function openShareByCode(rawCode, updateUrl, via) {
        var code = normalizeCode(rawCode);
        if (!code) return toast("Invalid share code.", "error");
        via = via === "qr" || via === "code" ? via : "link";

        state.currentSource = "share";
        state.currentCode = code;
        state.currentVia = via;
        el.joinCode.value = code;
        openItemModal();

        if (updateUrl && window.location.pathname !== "/s/" + code) {
          window.history.pushState({}, "", withKey(window.location.origin + "/s/" + code));
        }

        try {
          var response = await apiFetch("/api/share/" + encodeURIComponent(code) + "?via=" + encodeURIComponent(via));
          showItemResponse(response.item, "share", code);
        } catch (error) {
          showModalError(error.message || "Unable to open this share code.");
        }
      }

      async function showItemResponse(item, source, code) {
        if (item.encrypted) {
          try {
            ensureEncryptionKey(item.code);
            if (typeof item.text !== "string" && !item.locked) {
              var ready = await apiFetch("/api/share/" + encodeURIComponent(item.code) + "?via=link");
              item = ready.item;
            }
            item = await decryptItem(item, code || item.code);
          } catch (error) { showModalError(error.message); return; }
        }
        state.currentItem = item;
        state.currentSource = source;
        state.currentCode = code || item.code;

        el.modalLoading.classList.add("hidden");
        el.modalError.classList.add("hidden");
        el.modalTitle.textContent = item.title;
        el.modalExpiry.setAttribute("data-expires", String(item.expiresAt));
        el.modalExpiry.textContent = formatRemaining(item.expiresAt);
        setLockBadge(item.locked);
        if (item.encrypted) el.modalLockBadge.textContent = "Browser encrypted";

        if (typeof item.text === "string") {
          el.unlockForm.classList.add("hidden");
          el.modalContent.classList.remove("hidden");
          if (item.sharedBy) {
            el.modalSharedBy.textContent = "Shared by " + item.sharedBy.name + " · " + item.sharedBy.role;
            el.modalSharedBy.classList.remove("hidden");
          } else {
            el.modalSharedBy.classList.add("hidden");
          }
          renderLinkedText(el.modalText, item.text);
          addSmartTools(el.modalText, item.text, copyText, toast);
          updateDeleteButton(item.id);
          if (source === "share" && !item.burnAfterRead && !item.encrypted) {
            upsertLocalItem(Object.assign({}, item, {
              source: getDeleteToken(item.id) ? "mine" : "received",
              addedAt: Date.now()
            }), true);
            renderLocalItems();
            if (el.lastRefreshed) el.lastRefreshed.textContent = "Added just now";
          }
        } else {
          el.modalContent.classList.add("hidden");
          el.unlockForm.classList.remove("hidden");
          el.unlockPin.value = "";
          window.setTimeout(function () { el.unlockPin.focus(); }, 120);
        }
      }

      async function unlockCurrentItem(event) {
        event.preventDefault();
        if (!state.currentItem) return;

        var pin = el.unlockPin.value.trim();
        if (!pin) return fieldError(el.unlockPin, "Enter the PIN.");

        el.unlockSubmit.disabled = true;
        el.unlockSubmit.textContent = "Checking PIN…";

        var path = state.currentSource === "local"
          ? "/api/local/item/" + encodeURIComponent(state.currentItem.id) + "/unlock"
          : "/api/share/" + encodeURIComponent(state.currentCode) + "/unlock?via=" + encodeURIComponent(state.currentVia || "link");

        try {
          var response = await apiFetch(path, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ pin: pin })
          });
          showItemResponse(response.item, state.currentSource, state.currentCode);
          toast("Text unlocked.", "success");
        } catch (error) {
          toast(error.message || "Unable to unlock text.", "error");
          el.unlockPin.select();
        } finally {
          el.unlockSubmit.disabled = false;
          el.unlockSubmit.textContent = "Unlock text";
        }
      }

      async function deleteCurrentItem() {
        if (!state.currentItem) return;
        var token = getDeleteToken(state.currentItem.id);
        if (!token) return toast("This browser does not own the delete token.", "error");
        if (!window.confirm("Delete this share now? This cannot be undone.")) return;

        el.deleteButton.disabled = true;
        try {
          await apiFetch("/api/item/" + encodeURIComponent(state.currentItem.id), {
            method: "DELETE",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ deleteToken: token })
          });
          removeDeleteToken(state.currentItem.id);
          delete state.optimisticItems[state.currentItem.id];
          state.items = state.items.filter(function (item) { return item.id !== state.currentItem.id; });
          renderLocalItems();
          closeItemModal();
          toast("Share deleted.", "success");
        } catch (error) {
          toast(error.message || "Unable to delete share.", "error");
        } finally {
          el.deleteButton.disabled = false;
        }
      }

      function openItemModal() {
        state.currentItem = null;
        el.modalTitle.textContent = "Opening share";
        el.modalLoading.classList.remove("hidden");
        el.modalError.classList.add("hidden");
        el.modalContent.classList.add("hidden");
        el.unlockForm.classList.add("hidden");
        el.deleteButton.classList.add("hidden");
        el.deleteButton.classList.remove("inline-flex");
        el.itemModal.classList.remove("hidden");
        el.itemModal.classList.add("flex");
        el.itemModal.setAttribute("aria-hidden", "false");
        lockBodyScroll();
      }

      function closeItemModal() {
        el.itemModal.classList.add("hidden");
        el.itemModal.classList.remove("flex");
        el.itemModal.setAttribute("aria-hidden", "true");
        state.currentItem = null;
        state.currentSource = null;
        state.currentCode = null;
        state.currentVia = null;
        unlockBodyScrollIfClear();
        if (/^\/s\//.test(window.location.pathname)) window.history.pushState({}, "", "/");
      }

      function showModalError(message) {
        el.modalLoading.classList.add("hidden");
        el.unlockForm.classList.add("hidden");
        el.modalContent.classList.add("hidden");
        el.modalError.textContent = message;
        el.modalError.classList.remove("hidden");
        el.modalTitle.textContent = "Unable to open share";
        setLockBadge(false, true);
      }

      function setLockBadge(locked, error) {
        el.modalLockBadge.className = "rounded border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider";
        if (error) {
          el.modalLockBadge.classList.add("border-red-500/25", "bg-red-500/5", "text-red-300");
          el.modalLockBadge.textContent = "Unavailable";
        } else if (locked) {
          el.modalLockBadge.classList.add("border-violet-500/25", "bg-[var(--accent)]/10", "text-[var(--accent)]");
          el.modalLockBadge.textContent = "PIN locked";
        } else {
          el.modalLockBadge.classList.add("border-[var(--line)]", "bg-white/[.03]", "text-neutral-400");
          el.modalLockBadge.textContent = "Open text";
        }
      }

      function updateDeleteButton(itemId) {
        var token = getDeleteToken(itemId);
        el.deleteButton.classList.toggle("hidden", !token);
        el.deleteButton.classList.toggle("inline-flex", Boolean(token));
        if (el.editItemButton) {
          el.editItemButton.classList.toggle("hidden", !token);
          el.editItemButton.classList.toggle("inline-flex", Boolean(token));
        }
      }

      function showQrForCurrentItem() {
        if (!state.currentItem || !state.currentItem.code) return;
        showQr(state.currentItem.code, window.location.origin + "/s/" + state.currentItem.code);
      }

      function showQrForListItem(itemId) {
        var item = state.items.find(function (entry) { return entry.id === itemId; });
        if (!item) return toast("Share not found in the current board.", "error");
        showQr(item.code, window.location.origin + "/s/" + item.code);
      }

      /* ---------------------------------------------------------------- */
      /* File sharing (temporary, no account required)                    */
      /* ---------------------------------------------------------------- */

      async function createFileShare(event) {
        event.preventDefault();
        if (APP.maintenanceMode || !APP.fileSharingEnabled) {
          return toast("File sharing is currently disabled.", "error");
        }
        var files = el.fileInput.files ? Array.from(el.fileInput.files) : [];
        if (!files.length) return toast("Choose at least one file to share.", "error");

        var maxFileBytes = (APP.maxFileSizeMB || 2) * 1024 * 1024;
        var maxBatchBytes = (APP.maxBatchTotalMB || 30) * 1024 * 1024;
        var maxFiles = APP.maxFilesPerBatch || 15;
        if (files.length > maxFiles) {
          return toast("You can attach up to " + maxFiles + " files per share.", "error");
        }
        var total = 0;
        for (var i = 0; i < files.length; i += 1) {
          total += files[i].size;
          if (files[i].size > maxFileBytes) {
            return toast("Each file must be " + (APP.maxFileSizeMB || 2) + "MB or smaller (\"" + files[i].name + "\" is too large).", "error");
          }
        }
        if (total > maxBatchBytes) {
          return toast("This upload totals more than the " + (APP.maxBatchTotalMB || 30) + "MB batch limit.", "error");
        }

        var locked = APP.pinEnabled && el.fileLockToggle.checked;
        var pin = el.filePin.value.trim();
        if (locked && (pin.length < APP.minPinLength || pin.length > APP.maxPinLength)) {
          return fieldError(el.filePin, "PIN must be " + APP.minPinLength + "–" + APP.maxPinLength + " characters.");
        }

        var form = new FormData();
        files.forEach(function (file) { form.append("file", file); });
        form.append("title", el.fileTitle.value.trim());
        form.append("locked", locked ? "1" : "0");
        if (locked) form.append("pin", pin);
        form.append("burnAfterRead", el.fileBurnToggle.checked ? "1" : "0");
        if (APP.allowCustomCode && el.fileCustomCodeInput.value.trim()) {
          form.append("customCode", el.fileCustomCodeInput.value.trim());
        }
        if (el.fileTtlSelect && el.fileTtlSelect.value) {
          form.append("ttlSeconds", el.fileTtlSelect.value);
        }

        setButtonLoading(el.fileUploadSubmit, true, "Uploading…");
        try {
          var response = await apiFetch("/api/files", { method: "POST", body: form });
          saveDeleteToken("file:" + response.group.id, response.deleteToken);
          rememberDrop("file", response.group);
          refreshRecentDrops();
          if (!response.group.burnAfterRead) upsertLocalFile(response.group);
          renderFilesBoard();
          resetFileUploadForm();
          showQr(response.group.code, response.shareUrl);
          toast(response.message || "Uploaded.", "success");
        } catch (error) {
          toast(error.message || "Unable to upload the file.", "error");
        } finally {
          setButtonLoading(el.fileUploadSubmit, false, COPY.filesUploadButtonText || "Upload file");
        }
      }

      function resetFileUploadForm() {
        el.fileUploadForm.reset();
        el.fileInputName.textContent = "";
        el.filePinFieldWrap.classList.add("hidden");
        renderStagedFiles();
      }

      function renderStagedFiles() {
        var files = el.fileInput.files ? Array.from(el.fileInput.files) : [];
        el.fileInputName.textContent = files.length === 1 ? files[0].name : files.length ? files.length + " files selected" : "";
        el.stagedFilesList.textContent = "";

        if (!files.length) {
          el.stagedFilesList.classList.add("hidden");
          el.stagedFilesTotal.classList.add("hidden");
          return;
        }

        var total = 0;
        files.forEach(function (file) {
          total += file.size;
          var row = document.createElement("div");
          row.className = "flex items-center justify-between gap-3";
          var name = document.createElement("span");
          name.className = "truncate";
          name.textContent = file.name;
          var size = document.createElement("span");
          size.className = "shrink-0 text-neutral-600";
          size.textContent = formatBytes(file.size);
          row.appendChild(name);
          row.appendChild(size);
          el.stagedFilesList.appendChild(row);
        });
        el.stagedFilesList.classList.remove("hidden");

        var maxBatchMB = APP.maxBatchTotalMB || 30;
        var maxFiles = APP.maxFilesPerBatch || 15;
        el.stagedFilesTotal.textContent = files.length + " file" + (files.length === 1 ? "" : "s") + " · " +
          formatBytes(total) + " of " + maxBatchMB + "MB max, up to " + maxFiles + " files";
        el.stagedFilesTotal.classList.remove("hidden");
        el.stagedFilesTotal.classList.toggle("text-red-400", total > maxBatchMB * 1024 * 1024 || files.length > maxFiles);
      }

      function upsertLocalFile(file) {
        state.files = state.files.filter(function (entry) { return entry.id !== file.id; });
        state.files.unshift(file);
      }

      async function loadLocalFiles(showFeedback) {
        if (!el.filesRefreshButton) return;
        if (el.filesRefreshButton.disabled) return;
        el.filesRefreshButton.disabled = true;
        try {
          var response = await apiFetch("/api/local/files");
          var now = Date.now();
          state.files = (Array.isArray(response.files) ? response.files : [])
            .filter(function (item) { return Number(item.expiresAt) > now; });
          renderFilesBoard();
          if (showFeedback) toast("Files board refreshed.", "success");
        } catch (error) {
          if (showFeedback) toast(error.message || "Unable to load shared files.", "error");
        } finally {
          el.filesRefreshButton.disabled = false;
        }
      }

      function renderFilesBoard() {
        renderNearby();
        if (!el.filesBoardList) return;
        var now = Date.now();
        state.files = state.files.filter(function (item) { return Number(item.expiresAt) > now; });
        updateActiveCountBadge();
        el.filesBoardList.textContent = "";

        if (!state.files.length) {
          el.filesBoardList.classList.add("hidden");
          el.filesBoardEmpty.classList.remove("hidden");
          return;
        }
        el.filesBoardEmpty.classList.add("hidden");
        el.filesBoardList.classList.remove("hidden");

        state.files.forEach(function (item) {
          var card = document.createElement("article");
          card.className = "note-row";

          var titleWrap = document.createElement("div");
          titleWrap.className = "note-main";

          var meta = document.createElement("div");
          meta.className = "note-meta";
          var sourceBadge = document.createElement("span");
          sourceBadge.className = "note-badge " + (item.source === "received" ? "badge-received" : "badge-mine");
          sourceBadge.textContent = item.isOwner || getDeleteToken(item.id) || getDeleteToken("file:" + item.id) ? "Mine" : "Nearby";
          var lockBadge = document.createElement("span");
          lockBadge.className = "note-badge" + (item.locked ? " badge-locked" : "");
          lockBadge.textContent = item.locked ? "PIN locked" : "Open";
          var sizeBadge = document.createElement("span");
          sizeBadge.className = "note-badge";
          sizeBadge.textContent = (item.fileCount > 1 ? item.fileCount + " files · " : "") + formatBytes(item.totalSizeBytes);
          meta.appendChild(sourceBadge);
          meta.appendChild(lockBadge);
          meta.appendChild(sizeBadge);
          if (item.burnAfterRead) {
            var burnBadge = document.createElement("span");
            burnBadge.className = "note-badge badge-burn";
            burnBadge.textContent = "Open once";
            meta.appendChild(burnBadge);
          }
          var sharedByBadge = buildSharedByBadge(item.sharedBy, card);
          if (sharedByBadge) meta.appendChild(sharedByBadge);

          var title = document.createElement("h3");
          title.className = "note-title";
          title.textContent = item.title;

          var expiry = document.createElement("span");
          expiry.className = "note-expiry";
          expiry.setAttribute("data-expires", String(item.expiresAt));
          expiry.textContent = formatRemaining(item.expiresAt);

          titleWrap.appendChild(meta);
          titleWrap.appendChild(title);
          titleWrap.appendChild(expiry);

          var actions = document.createElement("div");
          actions.className = "note-actions";

          var openButton = document.createElement("button");
          openButton.type = "button";
          openButton.setAttribute("data-action", "open-local-file");
          openButton.setAttribute("data-file-id", item.id);
          openButton.className = "primary-action px-4 py-2 text-xs font-semibold";
          openButton.textContent = item.locked ? "Enter PIN" : "Open";

          var qrButton = document.createElement("button");
          qrButton.type = "button";
          qrButton.setAttribute("data-action", "share-local-file");
          qrButton.setAttribute("data-file-id", item.id);
          qrButton.className = "icon-button";
          qrButton.setAttribute("aria-label", "Show share code and QR");
          qrButton.innerHTML = '<svg viewBox="0 0 24 24" class="h-4 w-4"><use href="#i-qr-grid"></use></svg>';

          actions.appendChild(openButton);
          actions.appendChild(qrButton);
          card.appendChild(titleWrap);
          card.appendChild(actions);
          el.filesBoardList.appendChild(card);
        });
      }

      async function openLocalFile(fileId) {
        state.currentFileCode = null;
        openFileModal();
        try {
          var response = await apiFetch("/api/local/file/" + encodeURIComponent(fileId));
          showFileResponse(response.group, "local", null);
        } catch (error) {
          showFileModalError(error.message || "Unable to open this file.");
        }
      }

      async function openFileShareByCode(rawCode, updateUrl, via) {
        var code = normalizeCode(rawCode);
        if (!code) return toast("Invalid share code.", "error");
        via = via === "qr" || via === "code" ? via : "link";

        state.currentFileCode = code;
        openFileModal();

        if (updateUrl && window.location.pathname !== "/f/" + code) {
          window.history.pushState({}, "", "/f/" + code);
        }

        try {
          var response = await apiFetch("/api/share/file/" + encodeURIComponent(code) + "?via=" + encodeURIComponent(via));
          showFileResponse(response.group, "share", code);
        } catch (error) {
          showFileModalError(error.message || "Unable to open this share code.");
        }
      }

      function showFileResponse(group, source, code) {
        state.currentFile = group;
        state.currentFileCode = code || group.code;

        el.fileModalLoading.classList.add("hidden");
        el.fileModalError.classList.add("hidden");
        el.fileModalTitle.textContent = group.title;
        el.fileModalExpiry.setAttribute("data-expires", String(group.expiresAt));
        el.fileModalExpiry.textContent = formatRemaining(group.expiresAt);
        setFileLockBadge(group.locked);

        if (!group.locked && (!group.files || !group.files.length)) { showFileModalError("All attachments in this drop have already been downloaded."); return; }
        var isUnlocked = group.files && group.files.length && group.files[0].downloadUrl;
        if (isUnlocked) {
          el.fileUnlockForm.classList.add("hidden");
          el.fileModalContent.classList.remove("hidden");
          if (group.sharedBy) {
            el.fileModalSharedBy.textContent = "Shared by " + group.sharedBy.name + " · " + group.sharedBy.role;
            el.fileModalSharedBy.classList.remove("hidden");
          } else {
            el.fileModalSharedBy.classList.add("hidden");
          }
          renderFileModalList(group.files);
          addFileTools(el.fileModalList, group.files, group, toast);
          updateFileDeleteButton(group.id);
          if (source === "share" && !group.burnAfterRead) {
            upsertLocalFile(Object.assign({}, group, {
              source: getDeleteToken("file:" + group.id) ? "mine" : "received",
              addedAt: Date.now()
            }));
            renderFilesBoard();
          }
        } else {
          el.fileModalContent.classList.add("hidden");
          el.fileUnlockForm.classList.remove("hidden");
          el.fileUnlockPin.value = "";
          window.setTimeout(function () { el.fileUnlockPin.focus(); }, 120);
        }
      }

      function renderFileModalList(files) {
        el.fileModalList.textContent = "";
        files.forEach(function (file) {
          var row = document.createElement("div");
          row.className = "flex items-center justify-between gap-3 overflow-hidden rounded-xl border border-white/[.07] bg-black/20 p-4";
          var info = document.createElement("div");
          info.className = "min-w-0";
          var name = document.createElement("p");
          name.className = "truncate text-sm text-slate-200";
          name.textContent = file.filename;
          var meta = document.createElement("p");
          meta.className = "mt-1 text-xs text-neutral-500";
          meta.textContent = formatBytes(file.sizeBytes) + " · " + file.downloadCount + " downloads";
          info.appendChild(name);
          info.appendChild(meta);
          var download = document.createElement("a");
          download.href = file.downloadUrl;
          download.setAttribute("download", file.filename);
          download.className = "shrink-0 rounded-md bg-[var(--accent)] px-4 py-2 text-center text-sm font-semibold text-white transition hover:bg-[var(--accent-strong)]";
          download.textContent = "Download";
          row.appendChild(info);
          row.appendChild(download);
          el.fileModalList.appendChild(row);
        });
      }

      async function unlockCurrentFile(event) {
        event.preventDefault();
        if (!state.currentFile) return;
        var pin = el.fileUnlockPin.value.trim();
        if (!pin) return fieldError(el.fileUnlockPin, "Enter the PIN.");

        el.fileUnlockSubmit.disabled = true;
        el.fileUnlockSubmit.textContent = "Checking PIN…";

        var path = state.currentFile && !state.currentFileCode
          ? "/api/local/file/" + encodeURIComponent(state.currentFile.id) + "/unlock"
          : "/api/share/file/" + encodeURIComponent(state.currentFileCode) + "/unlock";

        try {
          var response = await apiFetch(path, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ pin: pin })
          });
          showFileResponse(response.group, state.currentFileCode ? "share" : "local", state.currentFileCode);
          toast("File unlocked.", "success");
        } catch (error) {
          toast(error.message || "Unable to unlock file.", "error");
          el.fileUnlockPin.select();
        } finally {
          el.fileUnlockSubmit.disabled = false;
          el.fileUnlockSubmit.textContent = "Unlock";
        }
      }

      async function deleteCurrentFile() {
        if (!state.currentFile) return;
        var token = getDeleteToken("file:" + state.currentFile.id);
        if (!token) return toast("This browser does not own the delete token.", "error");
        if (!window.confirm("Delete this file now? This cannot be undone.")) return;

        el.deleteFileButton.disabled = true;
        try {
          await apiFetch("/api/file/" + encodeURIComponent(state.currentFile.id), {
            method: "DELETE",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ deleteToken: token })
          });
          removeDeleteToken("file:" + state.currentFile.id);
          state.files = state.files.filter(function (item) { return item.id !== state.currentFile.id; });
          renderFilesBoard();
          closeFileModal();
          toast("File deleted.", "success");
        } catch (error) {
          toast(error.message || "Unable to delete file.", "error");
        } finally {
          el.deleteFileButton.disabled = false;
        }
      }

      /* --- Edit-in-place (notes): shared across all three auth tiers
       *  (anonymous via delete-token, owner via session, admin via bypass).
       *  For the admin tier there's no full-detail prefetch, so locked/
       *  burnAfterRead are only included in the saved patch if the admin
       *  actually touched that toggle -- otherwise they're left out of the
       *  patch entirely so the server's "omitted = unchanged" semantics
       *  protect against silently clearing an existing PIN or burn flag. */

      async function applyItemEditPrefill(item) {
        var prefillTarget = state.editTarget;
        if (item && state.editTarget) {
          state.editTarget.encrypted = Boolean(item.encrypted);
          state.editTarget.code = item.code;
          if (item.encrypted) {
            if (keyForCode(item.code)) item = await decryptItem(item, item.code);
            else { el.editItemText.disabled = true; item = Object.assign({}, item, { text: undefined }); el.editItemText.placeholder = "The original encrypted link is required to edit this text. You can still change its metadata."; }
          }
        }
        if (!item || state.editTarget !== prefillTarget) return;
        if (typeof item.title === "string") el.editItemTitle.value = item.title;
        if (typeof item.text === "string") el.editItemText.value = item.text;
        if (typeof item.locked === "boolean") {
          el.editItemLockToggle.checked = item.locked;
          if (el.editItemPinFieldWrap) el.editItemPinFieldWrap.classList.toggle("hidden", !item.locked);
        }
        if (typeof item.burnAfterRead === "boolean") el.editItemBurnToggle.checked = item.burnAfterRead;
      }

      function setEditorLoading(form, loading) {
        form.setAttribute("aria-busy", String(loading));
        Array.from(form.elements).forEach(function (control) { control.disabled = loading; });
      }

      async function openEditItemModal(itemId, tier, prefillData) {
        state.editTarget = { kind: "note", tier: tier, id: itemId, lockTouched: false, burnTouched: false };
        if (el.editItemError) el.editItemError.classList.add("hidden");
        el.editItemTitle.value = "";
        el.editItemText.value = "";
        el.editItemLockToggle.checked = false;
        if (el.editItemPinFieldWrap) el.editItemPinFieldWrap.classList.add("hidden");
        el.editItemPin.value = "";
        el.editItemBurnToggle.checked = false;
        el.editItemTtlSelect.value = "";
        el.editItemSubmit.disabled = false;
        el.editItemSubmit.textContent = "Save changes";

        await applyItemEditPrefill(prefillData);

        el.editItemModal.classList.remove("hidden");
        el.editItemModal.classList.add("flex");
        el.editItemModal.setAttribute("aria-hidden", "false");
        lockBodyScroll();

        var loadingTarget = state.editTarget;
        setEditorLoading(el.editItemForm, true);
        try {
          var response = tier === "admin"
            ? await adminFetch("/api/admin/item/" + encodeURIComponent(itemId))
            : await apiFetch(tier === "owner" ? "/api/me/shares/notes/" + encodeURIComponent(itemId) : "/api/item/" + encodeURIComponent(itemId), { headers: tier === "anonymous" ? { "x-airtext-owner": getDeleteToken(itemId) } : {} });
          if (state.editTarget !== loadingTarget) return;
          await applyItemEditPrefill(response.item);
          if (state.editTarget !== loadingTarget) return;
          setEditorLoading(el.editItemForm, false);
          el.editItemText.disabled = Boolean(loadingTarget.encrypted && !keyForCode(loadingTarget.code));
        } catch (error) {
          if (state.editTarget !== loadingTarget) return;
          el.editItemError.textContent = error.message || "Unable to load this note. Close and try again.";
          el.editItemError.classList.remove("hidden");
        }
      }

      function closeEditItemModal() {
        el.editItemModal.classList.add("hidden");
        el.editItemModal.classList.remove("flex");
        el.editItemModal.setAttribute("aria-hidden", "true");
        state.editTarget = null;
        unlockBodyScrollIfClear();
      }

      function collectItemEditPatch(target) {
        var patch = {};
        var title = el.editItemTitle.value.trim();
        if (title) patch.title = title;
        var text = el.editItemText.value;
        if (!el.editItemText.disabled && text.trim()) patch.text = text;

        var lockKnown = target.tier !== "admin";
        if (lockKnown || target.lockTouched) {
          patch.locked = el.editItemLockToggle.checked;
          if (patch.locked) {
            var pin = el.editItemPin.value.trim();
            if (pin) patch.pin = pin;
          }
        }
        var burnKnown = target.tier !== "admin";
        if (burnKnown || target.burnTouched) {
          patch.burnAfterRead = el.editItemBurnToggle.checked;
        }
        var ttl = el.editItemTtlSelect.value;
        if (ttl) patch.ttlSeconds = Number(ttl);
        return patch;
      }

      async function saveItemEdit(event) {
        event.preventDefault();
        if (!state.editTarget || state.editTarget.kind !== "note") return;
        var target = state.editTarget;
        var patch = collectItemEditPatch(target);

        el.editItemSubmit.disabled = true;
        el.editItemSubmit.textContent = "Saving…";
        try {
          if (target.encrypted && patch.text !== undefined) {
            if (!keyForCode(target.code)) throw new Error("The original encryption key is required to edit the text.");
            var updatedEnvelope = await encryptText(patch.text, keyForCode(target.code));
            patch.text = updatedEnvelope.text; patch.encrypted = true;
            patch.encryptionIv = updatedEnvelope.encryptionIv; patch.encryptionVersion = 1;
          }
          var response;
          if (target.tier === "anonymous") {
            var token = getDeleteToken(target.id);
            if (!token) throw new Error("This browser does not own the delete token.");
            patch.deleteToken = token;
            response = await apiFetch("/api/item/" + encodeURIComponent(target.id), {
              method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch)
            });
          } else if (target.tier === "owner") {
            response = await apiFetch("/api/me/shares/notes/" + encodeURIComponent(target.id), {
              method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch)
            });
          } else {
            response = await adminFetch("/api/admin/item/" + encodeURIComponent(target.id), {
              method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch)
            });
          }
          rememberDrop("note", response.item); refreshRecentDrops();
          if (response.item.burnAfterRead || response.item.encrypted) state.items = state.items.filter(function (entry) { return entry.id !== target.id; });
          toast(response.message || "Note updated.", "success");
          closeEditItemModal();
          if (state.currentItem && state.currentItem.id === target.id) await showItemResponse(response.item, state.currentSource, response.item.code);
          if (target.tier === "anonymous") {
            var existing = state.items.find(function (entry) { return entry.id === target.id; });
            if (existing) Object.assign(existing, response.item);
            renderLocalItems();
          } else if (target.tier === "owner") {
            await loadAccountShares();
          } else {
            await loadAdminDrops();
          }
        } catch (error) {
          if (el.editItemError) {
            el.editItemError.textContent = error.message || "Unable to save changes.";
            el.editItemError.classList.remove("hidden");
          } else {
            toast(error.message || "Unable to save changes.", "error");
          }
        } finally {
          el.editItemSubmit.disabled = false;
          el.editItemSubmit.textContent = "Save changes";
        }
      }

      async function editAccountNote(noteId) {
        await openEditItemModal(noteId, "owner", null);
      }

      async function shareAccountNoteToNetwork(noteId) {
        try {
          var response = await apiFetch("/api/me/shares/notes/" + encodeURIComponent(noteId) + "/share-to-network", { method: "POST" });
          toast(response.message || "Shared to this network.", "success");
        } catch (error) {
          toast(error.message || "Unable to share to this network.", "error");
        }
      }

      /* --- Edit-in-place (files): same three-tier shape as notes above,
       *  plus an existing-files remove list and a staged-new-files input. */

      function renderEditFileExistingList() {
        if (!el.editFileExistingList) return;
        el.editFileExistingList.textContent = "";
        var target = state.editTarget;
        if (!target || !target.existingFiles) return;
        target.existingFiles.forEach(function (file) {
          var removed = target.removeFileIds.indexOf(file.id) !== -1;
          var row = document.createElement("div");
          row.className = "flex items-center justify-between gap-2 rounded-lg border border-[var(--line)] bg-black/20 px-3 py-2";
          var label = document.createElement("span");
          label.className = "truncate " + (removed ? "text-slate-600 line-through" : "text-slate-300");
          label.textContent = file.filename;
          var button = document.createElement("button");
          button.type = "button";
          button.className = "shrink-0 text-xs " + (removed ? "text-cyan-400" : "text-red-300");
          button.setAttribute("data-action", "remove-edit-file");
          button.setAttribute("data-remove-file-id", file.id);
          button.textContent = removed ? "Undo" : "Remove";
          row.appendChild(label);
          row.appendChild(button);
          el.editFileExistingList.appendChild(row);
        });
      }

      function toggleEditFileRemoval(fileId) {
        var target = state.editTarget;
        if (!target || target.kind !== "file") return;
        var index = target.removeFileIds.indexOf(fileId);
        if (index === -1) target.removeFileIds.push(fileId);
        else target.removeFileIds.splice(index, 1);
        renderEditFileExistingList();
      }

      function renderEditFileStagedList() {
        if (!el.editFileStagedList || !el.editFileInput) return;
        var files = el.editFileInput.files ? Array.from(el.editFileInput.files) : [];
        el.editFileStagedList.textContent = "";
        if (!files.length) {
          el.editFileStagedList.classList.add("hidden");
          return;
        }
        el.editFileStagedList.classList.remove("hidden");
        files.forEach(function (file) {
          var row = document.createElement("div");
          row.className = "truncate";
          row.textContent = "+ " + file.name + " (" + formatBytes(file.size) + ")";
          el.editFileStagedList.appendChild(row);
        });
      }

      function applyFileEditPrefill(group) {
        if (!group) return;
        if (typeof group.title === "string") el.editFileTitle.value = group.title;
        if (typeof group.locked === "boolean") {
          el.editFileLockToggle.checked = group.locked;
          if (el.editFilePinFieldWrap) el.editFilePinFieldWrap.classList.toggle("hidden", !group.locked);
        }
        if (typeof group.burnAfterRead === "boolean") el.editFileBurnToggle.checked = group.burnAfterRead;
        if (Array.isArray(group.files) && state.editTarget) {
          state.editTarget.existingFiles = group.files.map(function (file) { return { id: file.id, filename: file.filename }; });
          renderEditFileExistingList();
        }
      }

      async function openEditFileModal(groupId, tier, prefillData) {
        state.editTarget = { kind: "file", tier: tier, id: groupId, existingFiles: [], removeFileIds: [], lockTouched: false, burnTouched: false };
        if (el.editFileError) el.editFileError.classList.add("hidden");
        el.editFileTitle.value = "";
        el.editFileLockToggle.checked = false;
        if (el.editFilePinFieldWrap) el.editFilePinFieldWrap.classList.add("hidden");
        el.editFilePin.value = "";
        el.editFileBurnToggle.checked = false;
        el.editFileTtlSelect.value = "";
        if (el.editFileInput) el.editFileInput.value = "";
        renderEditFileStagedList();
        renderEditFileExistingList();
        el.editFileSubmit.disabled = false;
        el.editFileSubmit.textContent = "Save changes";

        applyFileEditPrefill(prefillData);

        el.editFileModal.classList.remove("hidden");
        el.editFileModal.classList.add("flex");
        el.editFileModal.setAttribute("aria-hidden", "false");
        lockBodyScroll();

        var loadingTarget = state.editTarget;
        setEditorLoading(el.editFileForm, true);
        try {
          var response = tier === "admin"
            ? await adminFetch("/api/admin/file/" + encodeURIComponent(groupId))
            : await apiFetch(tier === "owner" ? "/api/me/shares/files/" + encodeURIComponent(groupId) : "/api/file/" + encodeURIComponent(groupId), {headers:tier === "anonymous" ? {"x-airtext-owner":getDeleteToken("file:" + groupId)} : {}});
          if (state.editTarget !== loadingTarget) return;
          applyFileEditPrefill(response.group);
          setEditorLoading(el.editFileForm, false);
        } catch (error) {
          if (state.editTarget !== loadingTarget) return;
          el.editFileError.textContent = error.message || "Unable to load this drop. Close and try again.";
          el.editFileError.classList.remove("hidden");
        }
      }

      function closeEditFileModal() {
        el.editFileModal.classList.add("hidden");
        el.editFileModal.classList.remove("flex");
        el.editFileModal.setAttribute("aria-hidden", "true");
        state.editTarget = null;
        unlockBodyScrollIfClear();
      }

      async function saveFileEdit(event) {
        event.preventDefault();
        if (!state.editTarget || state.editTarget.kind !== "file") return;
        var target = state.editTarget;

        var form = new FormData();
        var title = el.editFileTitle.value.trim();
        if (title) form.set("title", title);

        var lockKnown = target.tier !== "admin";
        if (lockKnown || target.lockTouched) {
          form.set("locked", el.editFileLockToggle.checked ? "1" : "0");
          if (el.editFileLockToggle.checked) {
            var pin = el.editFilePin.value.trim();
            if (pin) form.set("pin", pin);
          }
        }
        var burnKnown = target.tier !== "admin";
        if (burnKnown || target.burnTouched) {
          form.set("burnAfterRead", el.editFileBurnToggle.checked ? "1" : "0");
        }
        var ttl = el.editFileTtlSelect.value;
        if (ttl) form.set("ttlSeconds", ttl);
        if (target.removeFileIds.length) form.set("removeFileIds", JSON.stringify(target.removeFileIds));
        var newFiles = el.editFileInput && el.editFileInput.files ? Array.from(el.editFileInput.files) : [];
        newFiles.forEach(function (file) { form.append("file", file); });

        el.editFileSubmit.disabled = true;
        el.editFileSubmit.textContent = "Saving…";
        try {
          var response;
          if (target.tier === "anonymous") {
            var token = getDeleteToken("file:" + target.id);
            if (!token) throw new Error("This browser does not own the delete token.");
            form.set("deleteToken", token);
            response = await apiFetch("/api/file/" + encodeURIComponent(target.id), { method: "PATCH", body: form });
          } else if (target.tier === "owner") {
            response = await apiFetch("/api/me/shares/files/" + encodeURIComponent(target.id), { method: "PATCH", body: form });
          } else {
            response = await adminFetch("/api/admin/file/" + encodeURIComponent(target.id), { method: "PATCH", body: form });
          }
          rememberDrop("file", response.group); refreshRecentDrops();
          if (state.currentFile && state.currentFile.id === target.id) showFileResponse(response.group, "owner", response.group.code);
          toast(response.message || "File updated.", "success");
          closeEditFileModal();
          if (target.tier === "anonymous") {
            var existing = state.files.find(function (entry) { return entry.id === target.id; });
            if (existing) Object.assign(existing, response.group);
            renderFilesBoard();
          } else if (target.tier === "owner") {
            await loadAccountShares();
          } else {
            await loadAdminDrops();
          }
        } catch (error) {
          if (el.editFileError) {
            el.editFileError.textContent = error.message || "Unable to save changes.";
            el.editFileError.classList.remove("hidden");
          } else {
            toast(error.message || "Unable to save changes.", "error");
          }
        } finally {
          el.editFileSubmit.disabled = false;
          el.editFileSubmit.textContent = "Save changes";
        }
      }

      async function editAccountFile(groupId) {
        await openEditFileModal(groupId, "owner", null);
      }

      async function shareAccountFileToNetwork(groupId) {
        try {
          var response = await apiFetch("/api/me/shares/files/" + encodeURIComponent(groupId) + "/share-to-network", { method: "POST" });
          toast(response.message || "Shared to this network.", "success");
        } catch (error) {
          toast(error.message || "Unable to share to this network.", "error");
        }
      }

      function openFileModal() {
        state.currentFile = null;
        el.fileModalTitle.textContent = "Opening file";
        el.fileModalLoading.classList.remove("hidden");
        el.fileModalError.classList.add("hidden");
        el.fileModalContent.classList.add("hidden");
        el.fileUnlockForm.classList.add("hidden");
        el.deleteFileButton.classList.add("hidden");
        el.deleteFileButton.classList.remove("inline-flex");
        el.fileModal.classList.remove("hidden");
        el.fileModal.classList.add("flex");
        el.fileModal.setAttribute("aria-hidden", "false");
        lockBodyScroll();
      }

      function closeFileModal() {
        el.fileModal.classList.add("hidden");
        el.fileModal.classList.remove("flex");
        el.fileModal.setAttribute("aria-hidden", "true");
        state.currentFile = null;
        state.currentFileCode = null;
        unlockBodyScrollIfClear();
        if (/^\/f\//.test(window.location.pathname)) window.history.pushState({}, "", "/");
      }

      function showFileModalError(message) {
        el.fileModalLoading.classList.add("hidden");
        el.fileUnlockForm.classList.add("hidden");
        el.fileModalContent.classList.add("hidden");
        el.fileModalError.textContent = message;
        el.fileModalError.classList.remove("hidden");
        el.fileModalTitle.textContent = "Unable to open file";
        setFileLockBadge(false, true);
      }

      function setFileLockBadge(locked, error) {
        el.fileModalLockBadge.className = "rounded border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider";
        if (error) {
          el.fileModalLockBadge.classList.add("border-red-500/25", "bg-red-500/5", "text-red-300");
          el.fileModalLockBadge.textContent = "Unavailable";
        } else if (locked) {
          el.fileModalLockBadge.classList.add("border-violet-500/25", "bg-[var(--accent)]/10", "text-[var(--accent)]");
          el.fileModalLockBadge.textContent = "PIN locked";
        } else {
          el.fileModalLockBadge.classList.add("border-[var(--line)]", "bg-white/[.03]", "text-neutral-400");
          el.fileModalLockBadge.textContent = "Open file";
        }
      }

      function updateFileDeleteButton(fileId) {
        var token = getDeleteToken("file:" + fileId);
        el.deleteFileButton.classList.toggle("hidden", !token);
        el.deleteFileButton.classList.toggle("inline-flex", Boolean(token));
        if (el.editFileButton) {
          el.editFileButton.classList.toggle("hidden", !token);
          el.editFileButton.classList.toggle("inline-flex", Boolean(token));
        }
      }

      function showQrForCurrentFile() {
        if (!state.currentFile || !state.currentFile.code) return;
        showQr(state.currentFile.code, window.location.origin + "/f/" + state.currentFile.code);
      }

      function showQrForListFile(fileId) {
        var item = state.files.find(function (entry) { return entry.id === fileId; });
        if (!item) return toast("Shared file not found on this board.", "error");
        showQr(item.code, window.location.origin + "/f/" + item.code);
      }

      /* ---------------------------------------------------------------- */
      /* Standalone QR generator for links (client-side only)             */
      /* ---------------------------------------------------------------- */

      async function generateLinkQrTool(event) {
        event.preventDefault();
        var raw = el.qrtoolInput.value.trim();
        if (!raw) return fieldError(el.qrtoolInput, "Paste a link first.");
        var href = toSafeLinkHref(raw);
        if (!href) return fieldError(el.qrtoolInput, "Enter a valid http(s) link.");

        el.qrtoolOutput.textContent = "";
        try {
          await ensureScript("/vendor/qrcode.min.js", "QRCode");
        } catch (error) {}

        if (typeof window.QRCode === "function") {
          new window.QRCode(el.qrtoolOutput, {
            text: href,
            width: 220,
            height: 220,
            colorDark: "#11120f",
            colorLight: "#ffffff",
            correctLevel: window.QRCode.CorrectLevel.H
          });
          el.qrtoolOutputWrap.classList.remove("hidden");
        } else {
          toast("QR library did not load. Please try again.", "error");
        }
      }

      function downloadQrToolPng() {
        var canvas = el.qrtoolOutput.querySelector("canvas");
        if (!canvas) return toast("Generate a QR code first.", "error");
        var link = document.createElement("a");
        link.download = "qr-code.png";
        link.href = canvas.toDataURL("image/png");
        link.click();
      }

      function qrShareLink(link) {
        var url = new URL(link, window.location.origin);
        url.searchParams.set("via", "qr");
        return url.href;
      }
      async function showQr(code, link) {
        link = withKey(link);
        state.qrCode = code;
        el.qrCodeText.textContent = code;
        el.qrLinkInput.value = link;
        el.qrOutput.textContent = "";

        try {
          await ensureScript("/vendor/qrcode.min.js", "QRCode");
        } catch (error) {}

        if (typeof window.QRCode === "function") {
          new window.QRCode(el.qrOutput, {
            text: qrShareLink(link),
            width: 220,
            height: 220,
            colorDark: "#11120f",
            colorLight: "#ffffff",
            correctLevel: window.QRCode.CorrectLevel.H
          });
        } else {
          var message = document.createElement("p");
          message.className = "py-12 text-center text-sm text-neutral-600";
          message.textContent = "QR library did not load. Copy the link below instead.";
          el.qrOutput.appendChild(message);
        }

        el.qrModal.classList.remove("hidden");
        el.qrModal.classList.add("flex");
        el.qrModal.setAttribute("aria-hidden", "false");
        lockBodyScroll();
      }

      function closeQrModal() {
        el.qrModal.classList.add("hidden");
        el.qrModal.classList.remove("flex");
        el.qrModal.setAttribute("aria-hidden", "true");
        unlockBodyScrollIfClear();
      }

      async function openScanner() {
        el.scannerModal.classList.remove("hidden");
        el.scannerModal.classList.add("flex");
        el.scannerModal.setAttribute("aria-hidden", "false");
        lockBodyScroll();
        el.scannerStatus.textContent = "Starting camera…";

        try {
          await ensureScript("/vendor/html5-qrcode.min.js", "Html5Qrcode");
        } catch (error) {}

        if (typeof window.Html5Qrcode !== "function") {
          el.scannerStatus.textContent = "Scanner library did not load. Enter the code manually.";
          return;
        }

        if (state.scannerRunning) return;

        try {
          state.scanner = new window.Html5Qrcode("qr-reader");
          state.scannerRunning = true;
          await state.scanner.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: { width: 240, height: 240 }, aspectRatio: 1 },
            function (decodedText) { handleScannedValue(decodedText); },
            function () {}
          );
          el.scannerStatus.textContent = "Point the camera at the QR code.";
        } catch (error) {
          console.error(error);
          state.scannerRunning = false;
          el.scannerStatus.textContent = "Camera could not start. Check permission or enter the code manually.";
        }
      }

      async function closeScanner() {
        if (state.scanner && state.scannerRunning) {
          try { await state.scanner.stop(); } catch (error) { console.warn(error); }
          try { await state.scanner.clear(); } catch (error) { console.warn(error); }
        }
        state.scanner = null;
        state.scannerRunning = false;
        document.getElementById("qr-reader").textContent = "";
        el.scannerModal.classList.add("hidden");
        el.scannerModal.classList.remove("flex");
        el.scannerModal.setAttribute("aria-hidden", "true");
        unlockBodyScrollIfClear();
      }

      async function handleScannedValue(decodedText) {
        var scanned = extractCodeFromScan(decodedText);
        if (!scanned.code) {
          el.scannerStatus.textContent = "That QR does not contain a valid share code.";
          return;
        }
        await closeScanner();
        if (scanned.kind === "file") {
          openFileShareByCode(scanned.code, true, "qr");
        } else if (scanned.kind === "note") {
          openShareByCode(scanned.code, true, "qr");
        } else {
          openAnyShareByCode(scanned.code, true, "qr");
        }
      }

      function ensureScript(src, globalName) {
        if (window[globalName]) return Promise.resolve();
        return new Promise(function (resolve, reject) {
          var existing = document.querySelector('script[data-airtext-src="' + src + '"]');
          if (existing) {
            existing.addEventListener("load", resolve, { once: true });
            existing.addEventListener("error", reject, { once: true });
            return;
          }
          var script = document.createElement("script");
          script.src = src;
          script.async = true;
          script.setAttribute("data-airtext-src", src);
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      }

      function extractCodeFromScan(value) {
        var text = String(value || "").trim();
        try {
          var parsed = new URL(text, window.location.origin);
          rememberLinkKey(parsed.href);
          var noteMatch = parsed.pathname.match(/^\/s\/([A-Za-z0-9]{4,12})\/?$/);
          if (noteMatch) return { code: normalizeCode(noteMatch[1]), kind: "note" };
          var fileMatch = parsed.pathname.match(/^\/f\/([A-Za-z0-9]{4,12})\/?$/);
          if (fileMatch) return { code: normalizeCode(fileMatch[1]), kind: "file" };
        } catch (error) {}
        var plain = normalizeCode(text);
        return { code: plain.length >= 4 ? plain : "", kind: "unknown" };
      }

      function applyPublicSettings() {
        var disabled = APP.maintenanceMode || !APP.notesEnabled;
        // Tier 1/2 admin-editable settings live on APP (boot data); the
        // ~90 static micro-copy keys deleted from DEFAULT_SETTINGS
        // (V3-PLAN.md section 2) live in copy.js. No key names overlap
        // between the two, so a merge is a safe single lookup source.
        var textSource = Object.assign({}, COPY, APP);
        var textMap = {
          "drawer-scan-text": "drawerScanText",
          "announcement-label": "announcementLabel",
          "announcement-text": "announcement",
          "hero-eyebrow": "heroEyebrow",
          "hero-title-primary": "heroTitlePrimary",
          "hero-title-outline": "heroTitleOutline",
          "hero-description": "heroDescription",
          "hero-primary-button": "heroPrimaryButtonText",
          "hero-secondary-button": "heroSecondaryButtonText",
          "hero-panel-eyebrow": "heroPanelEyebrow",
          "hero-panel-title": "heroPanelTitle",
          "hero-panel-text": "heroPanelText",
          "hero-panel-step1": "heroPanelStep1",
          "hero-panel-step2": "heroPanelStep2",
          "hero-panel-step3": "heroPanelStep3",
          "hero-stat1-value": "heroPanelStat1Value",
          "hero-stat1-label": "heroPanelStat1Label",
          "hero-stat2-value": "heroPanelStat2Value",
          "hero-stat2-label": "heroPanelStat2Label",
          "create-section-title": "createSectionTitle",
          "create-temporary-badge": "createTemporaryBadge",
          "create-privacy-note": "createPrivacyNote",
          "pin-toggle-text": "pinToggleText",
          "available-title": "availableTitle",
          "available-empty-text": "availableEmptyText",
          "open-code-title": "openCodeTitle",
          "open-code-button-text": "openCodeButtonText",
          "scan-qr-text": "scanQrText",
          "guide-eyebrow": "guideEyebrow",
          "guide-title": "guideTitle",
          "guide-step1-title": "guideStep1Title",
          "guide-step1-text": "guideStep1Text",
          "guide-step2-title": "guideStep2Title",
          "guide-step2-text": "guideStep2Text",
          "guide-step3-title": "guideStep3Title",
          "guide-step3-text": "guideStep3Text",
          "guide-step4-title": "guideStep4Title",
          "guide-step4-text": "guideStep4Text",
          "feedback-eyebrow": "feedbackEyebrow",
          "feedback-title": "feedbackTitle",
          "feedback-intro": "feedbackIntro",
          "about-eyebrow": "aboutEyebrow",
          "about-title": "aboutTitle",
          "about-text": "aboutText",
          "developer-name": "developerName",
          "developer-role": "developerRole",
          "developer-bio": "developerBio",
          "footer-tagline": "footerTagline",
          "footer-explore-title": "footerExploreTitle",
          "footer-information-title": "footerInformationTitle",
          "footer-connect-title": "footerConnectTitle",
          "footer-create-text": "footerCreateText",
          "footer-available-text": "footerAvailableText",
          "footer-open-code-text": "footerOpenCodeText",
          "footer-guide-text": "footerGuideText",
          "footer-feedback-text": "footerFeedbackText",
          "footer-about-text": "footerAboutText",
          "footer-developer-name": "developerName",
          "privacy-text": "privacyText",
          "network-mode-text": "privacyText",
          "maintenance-eyebrow": "maintenanceEyebrow",
          "maintenance-title": "maintenanceTitle",
          "maintenance-message": "maintenanceMessage",
          "maintenance-button": "maintenanceButtonText",
          "files-section-title": "filesSectionTitle",
          "files-temporary-badge": "filesTemporaryBadge",
          "files-privacy-note": "filesPrivacyNote",
          "files-available-title": "filesAvailableTitle",
          "files-empty-text": "filesEmptyText",
          "files-drop-hint": "filesDropHint",
          "files-upload-button-text": "filesUploadButtonText",
          "qrtool-eyebrow": "qrLinkToolEyebrow",
          "qrtool-title": "qrLinkToolTitle",
          "qrtool-subtitle": "qrLinkToolSubtitle",
          "qrtool-button-text": "qrLinkToolButtonText",
          "qrtool-download-text": "qrLinkToolDownloadText"
        };
        Object.keys(textMap).forEach(function (id) {
          setNodeText(id, textSource[textMap[id]]);
        });

        document.querySelectorAll('[data-ticker-item="1"]').forEach(function (node) { node.textContent = COPY.tickerItem1; });
        document.querySelectorAll('[data-ticker-item="2"]').forEach(function (node) { node.textContent = COPY.tickerItem2; });
        document.querySelectorAll('[data-ticker-item="3"]').forEach(function (node) { node.textContent = COPY.tickerItem3; });
        document.querySelectorAll('[data-ticker-item="4"]').forEach(function (node) { node.textContent = COPY.tickerItem4; });

        setPlaceholder(el.shareTitle, COPY.createTitlePlaceholder);
        setPlaceholder(el.shareText, COPY.createTextPlaceholder);
        setPlaceholder(el.notesSearch, COPY.availableSearchPlaceholder);
        setPlaceholder(el.joinCode, COPY.openCodePlaceholder);
        setPlaceholder(el.feedbackMessage, COPY.feedbackMessagePlaceholder);
        setPlaceholder(el.feedbackEmail, COPY.feedbackEmailPlaceholder);
        setPlaceholder(el.fileTitle, COPY.filesUploadPlaceholder);
        setPlaceholder(el.qrtoolInput, COPY.qrLinkToolPlaceholder);
        var createLabel = el.createSubmit && el.createSubmit.querySelector("[data-button-label]");
        if (createLabel) createLabel.textContent = COPY.createButtonText;
        if (el.feedbackSubmit) el.feedbackSubmit.textContent = COPY.feedbackButtonText;
        if (el.createExpiryCopy) {
          el.createExpiryCopy.textContent = String(COPY.createSectionSubtitle || "")
            .replace("{duration}", formatDuration(APP.ttlSeconds));
        }
        var filesSubtitle = document.getElementById("files-section-subtitle");
        if (filesSubtitle) {
          filesSubtitle.textContent = String(COPY.filesSectionSubtitle || "")
            .replace("{duration}", formatDuration(APP.fileTtlSeconds || APP.ttlSeconds));
        }
        var filesDropHint = document.getElementById("files-drop-hint");
        if (filesDropHint) {
          filesDropHint.textContent = (COPY.filesDropHint || "Drag and drop a file here, or click to choose one.")
            + " (max " + (APP.maxFileSizeMB || 25) + "MB)";
        }

        // The 12 section-visibility toggles (heroEnabled, heroPanelEnabled,
        // tickerEnabled, createSectionEnabled, availableSectionEnabled,
        // openCodeSectionEnabled, guideEnabled, aboutEnabled, footerEnabled,
        // socialLinksEnabled, footerShowYear, footerShowDeveloper) were
        // deleted from DEFAULT_SETTINGS (V3-PLAN.md section 2) -- those
        // sections are simply always on now. Only the still-live Tier 1
        // feature flags keep their visibility gating below.
        setSectionVisibility("announcement-bar", APP.announcementEnabled);
        setSectionVisibility("files-card", APP.fileSharingEnabled);
        setSectionVisibility("files-board-section", APP.fileSharingEnabled);
        setSectionVisibility("nav-files-link", APP.fileSharingEnabled);
        setSectionVisibility("nav-qr-link", APP.qrLinkToolEnabled);
        setSectionVisibility("qrtool-page", APP.qrLinkToolEnabled);
        setSectionVisibility("feedback-drawer-section", APP.feedbackEnabled);
        setSectionVisibility("footer-feedback-text", APP.feedbackEnabled);

        renderSocialLinks();
        var year = new Date().getFullYear() + " ";
        setNodeText("footer-copyright", "© " + year + APP.appName + ". " + COPY.footerRightsText);
        var developerLine = document.getElementById("footer-developer-line");
        if (developerLine) {
          developerLine.classList.remove("hidden");
          developerLine.textContent = COPY.footerDeveloperPrefix + " ";
          var strong = document.createElement("strong");
          strong.textContent = APP.developerName;
          developerLine.appendChild(strong);
        }

        if (el.maintenanceBanner) el.maintenanceBanner.classList.toggle("hidden", !APP.maintenanceMode);
        if (el.createSubmit) {
          el.createSubmit.disabled = disabled;
          el.createSubmit.setAttribute("aria-disabled", disabled ? "true" : "false");
          if (disabled && createLabel) createLabel.textContent = "New notes disabled";
        }
        var filesDisabled = APP.maintenanceMode || !APP.fileSharingEnabled;
        if (el.fileUploadSubmit) {
          el.fileUploadSubmit.disabled = filesDisabled;
          el.fileUploadSubmit.setAttribute("aria-disabled", filesDisabled ? "true" : "false");
          var filesLabel = el.fileUploadSubmit.querySelector("[data-button-label]");
          if (filesLabel) filesLabel.textContent = filesDisabled ? "File sharing disabled" : COPY.filesUploadButtonText;
        }
        if (el.fileLockToggle) {
          var fileLockLabel = el.fileLockToggle.closest("label");
          if (fileLockLabel) fileLockLabel.classList.toggle("hidden", !APP.pinEnabled);
          if (!APP.pinEnabled) {
            el.fileLockToggle.checked = false;
            if (el.filePinFieldWrap) el.filePinFieldWrap.classList.add("hidden");
          }
        }
        if (el.lockControl) {
          el.lockControl.classList.toggle("hidden", !APP.pinEnabled);
          if (!APP.pinEnabled) {
            if (el.lockToggle) el.lockToggle.checked = false;
            if (el.pinFieldWrap) el.pinFieldWrap.classList.add("hidden");
          }
        }
        if (el.feedbackSection) el.feedbackSection.classList.toggle("hidden", !APP.feedbackEnabled);
        if (el.customCodeFieldWrap) el.customCodeFieldWrap.classList.toggle("hidden", !APP.allowCustomCode);
        if (el.fileCustomCodeFieldWrap) el.fileCustomCodeFieldWrap.classList.toggle("hidden", !APP.allowCustomCode);
        if (APP.maintenanceMode) {
          var maintenanceModal = document.getElementById("maintenance-modal");
          if (maintenanceModal) {
            maintenanceModal.classList.remove("hidden-force");
            lockBodyScroll();
          }
        }

        highlightActiveNav();
      }

      function setPlaceholder(node, value) {
        if (node) node.placeholder = value == null ? "" : String(value);
      }

      function highlightActiveNav() {
        var path = window.location.pathname;
        document.querySelectorAll("[data-nav-path]").forEach(function (link) {
          var active = link.getAttribute("data-nav-path") === path;
          link.classList.toggle("nav-active", active);
          if (active && link.closest("details.nav-dropdown")) link.closest("details.nav-dropdown").classList.add("nav-active");
          if (active) link.setAttribute("aria-current", "page");
          else link.removeAttribute("aria-current");
        });
      }

      function setNodeText(id, value) {
        var node = document.getElementById(id);
        if (node) node.textContent = String(value == null ? "" : value);
      }

      function setSectionVisibility(id, visible) {
        var node = document.getElementById(id);
        if (node) node.classList.toggle("hidden-force", !visible);
      }

      function renderSocialLinks() {
        var entries = [
          ["Facebook", APP.socialFacebook],
          ["Instagram", APP.socialInstagram],
          ["X", APP.socialX],
          ["LinkedIn", APP.socialLinkedIn],
          ["GitHub", APP.socialGitHub],
          ["YouTube", APP.socialYouTube]
        ].filter(function (entry) { return safeExternalUrl(entry[1]); });
        ["footer-social-links", "about-social-links"].forEach(function (id) {
          var container = document.getElementById(id);
          if (!container) return;
          container.textContent = "";
          entries.forEach(function (entry) {
            var link = document.createElement("a");
            link.className = "social-link";
            link.href = safeExternalUrl(entry[1]);
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.textContent = entry[0];
            container.appendChild(link);
          });
        });
        // socialLinksEnabled was deleted -- social links now hide purely
        // based on whether any URL is actually configured.
        setSectionVisibility("footer-social-column", entries.length > 0);
        setSectionVisibility("about-social-links", entries.length > 0);

        var contacts = document.getElementById("developer-contact-links");
        if (contacts) {
          contacts.textContent = "";
          var website = safeExternalUrl(APP.developerWebsite);
          if (website) contacts.appendChild(createContactLink("Website", website));
          if (isEmailAddress(APP.developerEmail)) {
            contacts.appendChild(createContactLink("Email", "mailto:" + APP.developerEmail));
          }
        }
      }

      function createContactLink(label, href) {
        var link = document.createElement("a");
        link.className = "social-link";
        link.href = href;
        link.target = href.indexOf("mailto:") === 0 ? "_self" : "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = label;
        return link;
      }

      function safeExternalUrl(value) {
        var raw = String(value || "").trim();
        if (!raw) return "";
        try {
          var candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : "https://" + raw;
          var parsed = new URL(candidate);
          return /^(?:https?:)$/i.test(parsed.protocol) ? parsed.href : "";
        } catch (error) {
          return "";
        }
      }

      function toggleTheme() {
        var current = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
        var next = current === "light" ? "dark" : "light";
        document.documentElement.setAttribute("data-theme", next);
        localStorage.setItem("airtext_theme", next);
        syncThemeButtons();
      }

      function syncThemeButtons() {
        var theme = document.documentElement.getAttribute("data-theme") || "dark";
        document.querySelectorAll('[data-action="toggle-theme"]').forEach(function (button) {
          button.setAttribute("aria-label", theme === "light" ? "Switch to dark mode" : "Switch to light mode");
          button.setAttribute("title", theme === "light" ? "Dark mode" : "Light mode");
        });
      }

      function openDrawer(targetId) {
        el.drawer.classList.add("open");
        el.drawerBackdrop.classList.add("open");
        el.drawer.setAttribute("aria-hidden", "false");
        lockBodyScroll();
        if (targetId) {
          window.setTimeout(function () {
            var target = document.getElementById(targetId);
            if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
          }, 180);
        }
      }

      function closeDrawer() {
        el.drawer.classList.remove("open");
        el.drawerBackdrop.classList.remove("open");
        el.drawer.setAttribute("aria-hidden", "true");
        unlockBodyScrollIfClear();
      }

      async function submitFeedback(event) {
        event.preventDefault();
        var message = el.feedbackMessage.value.trim();
        if (message.length < 5) return fieldError(el.feedbackMessage, "Please add a little more detail.");

        el.feedbackSubmit.disabled = true;
        el.feedbackSubmit.textContent = "Submitting…";
        try {
          var response = await apiFetch("/api/feedback", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              category: el.feedbackCategory.value,
              message: message,
              email: el.feedbackEmail.value.trim(),
              rating: Number(el.feedbackRating.value || 0)
            })
          });
          el.feedbackForm.reset();
          toast(response.message || "Thank you for the feedback.", "success");
        } catch (error) {
          toast(error.message || "Unable to submit feedback.", "error");
        } finally {
          el.feedbackSubmit.disabled = false;
          el.feedbackSubmit.textContent = COPY.feedbackButtonText;
        }
      }

      /** V3-PLAN 3.3/3.5/6: the mobile side-drawer mirrors the desktop nav's
       *  signed-in state (avatar + tier badge + My Drops/Admin panel/Sign
       *  out), since #drawer-auth-slot is rendered server-side as a plain
       *  "Sign in ->" link on every page load (see SIDE_DRAWER in html.ts)
       *  and has no per-request viewer data to key off of. */
      function updateAccountLinkLabel() {
        if (!el.drawerAuthSlot) return;
        apiFetch("/api/auth/session").then(function (session) {
          renderDrawerAuthSlot(session.authenticated ? session.user : null);
        }).catch(function () {
          renderDrawerAuthSlot(null);
        });
      }

      function renderDrawerAuthSlot(user) {
        el.drawerAuthSlot.textContent = "";
        if (!user) {
          var signIn = document.createElement("a");
          signIn.href = "/login";
          signIn.className = "inline-block text-[var(--accent)]";
          signIn.textContent = "Sign in →";
          el.drawerAuthSlot.appendChild(signIn);
          return;
        }

        var head = document.createElement("div");
        head.className = "flex items-center gap-3";
        head.appendChild(buildTierAvatarEl(user.displayName, user.rank));
        var info = document.createElement("div");
        info.className = "min-w-0";
        var name = document.createElement("p");
        name.className = "truncate text-sm font-semibold text-white";
        name.textContent = user.displayName;
        var badge = document.createElement("span");
        badge.className = "tier-badge " + tierBadgeClass(user.rank);
        badge.textContent = tierBadgeIcon(user.rank) + " " + (user.roleName || "");
        info.appendChild(name);
        info.appendChild(badge);
        head.appendChild(info);
        el.drawerAuthSlot.appendChild(head);

        var links = document.createElement("div");
        links.className = "mt-3 grid gap-2 text-sm";
        var myDrops = document.createElement("a");
        myDrops.href = "/account";
        myDrops.className = "text-[var(--accent)]";
        myDrops.textContent = "My Drops →";
        links.appendChild(myDrops);
        if (user.rank === 0) {
          var adminLink = document.createElement("a");
          adminLink.href = "/admin";
          adminLink.className = "text-[var(--accent)]";
          adminLink.textContent = "Admin panel →";
          links.appendChild(adminLink);
        }
        var signOut = document.createElement("button");
        signOut.type = "button";
        signOut.className = "text-left text-red-300";
        signOut.setAttribute("data-action", "nav-sign-out");
        signOut.textContent = "Sign out";
        links.appendChild(signOut);
        el.drawerAuthSlot.appendChild(links);
      }

      /* --- Tier avatar/badge helpers (V3-PLAN 3.3/3.5) --------------------
       * Mirrors the identical hash/initials algorithm in src/html.ts's
       * renderTierAvatar() so a given displayName renders the same color
       * whether the avatar was server-rendered (desktop nav) or built here
       * client-side (drawer, post-login /account dashboard swap). Rank 0 =
       * Admin, 1 = Pro, 2 = Member (V3-PLAN 0.2 role rename). */
      function hashHue(input) {
        var hash = 0;
        for (var i = 0; i < input.length; i++) {
          hash = (Math.imul(hash, 31) + input.charCodeAt(i)) >>> 0;
        }
        return hash % 360;
      }

      function getInitials(name) {
        var parts = String(name || "").trim().split(/\s+/).filter(Boolean);
        if (parts.length === 0) return "?";
        if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
        return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
      }

      function tierRingClass(rank) {
        if (rank === 0) return "tier-ring-admin";
        if (rank === 1) return "tier-ring-pro";
        return "tier-ring-member";
      }

      function tierBadgeClass(rank) {
        if (rank === 0) return "tier-badge-admin";
        if (rank === 1) return "tier-badge-pro";
        return "tier-badge-member";
      }

      function tierBadgeIcon(rank) {
        if (rank === 0) return "\u{1F451}";
        if (rank === 1) return "★";
        return "●";
      }

      function buildTierAvatarEl(displayName, rank) {
        var span = document.createElement("span");
        span.className = "tier-avatar " + tierRingClass(rank);
        span.style.background = "hsl(" + hashHue(displayName || "?") + " 62% 42%)";
        span.textContent = getInitials(displayName);
        return span;
      }

      /** /login (V3 unified front door). Posts to the same any-rank
       *  /api/auth/login endpoint /account uses, but redirects instead of
       *  swapping in a dashboard in place: to /account normally, or shows
       *  an "open the admin panel" hint when the signed-in account is
       *  rank 0 (admin). */
      async function submitLoginPage(event) {
        event.preventDefault();
        if (!el.loginEmail || !el.loginPassword) return;
        var email = el.loginEmail.value.trim();
        var password = el.loginPassword.value;
        if (el.loginError) el.loginError.classList.add("hidden");
        if (!email) return fieldError(el.loginEmail, "Enter your email.");
        if (!password) return fieldError(el.loginPassword, "Enter your password.");

        if (el.loginSubmit) {
          el.loginSubmit.disabled = true;
          el.loginSubmit.textContent = "Signing in…";
        }
        try {
          await apiFetch("/api/auth/login", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email: email, password: password })
          });
          var session = await apiFetch("/api/auth/session");
          if (session.authenticated && session.user && session.user.rank === 0) {
            if (el.loginAdminHint) el.loginAdminHint.classList.remove("hidden");
            if (el.loginSubmit) el.loginSubmit.textContent = "Signed in";
            toast("Signed in.", "success");
          } else {
            window.location.href = "/account";
          }
        } catch (error) {
          if (el.loginError) {
            el.loginError.textContent = error.message || "Incorrect email or password.";
            el.loginError.classList.remove("hidden");
          }
          if (el.loginSubmit) {
            el.loginSubmit.disabled = false;
            el.loginSubmit.textContent = "Sign in";
          }
        }
      }

      async function signOutFromNav() {
        try {
          await apiFetch("/api/auth/logout", { method: "POST" });
        } catch (error) {}
        window.location.href = "/";
      }

      async function initAccount() {
        try {
          var session = await apiFetch("/api/auth/session");
          if (session.authenticated) {
            await showAccountDashboard(session.user);
          } else {
            el.accountEmail.focus();
          }
        } catch (error) {
          toast(error.message || "Unable to check your session.", "error");
        }
      }

      async function accountLogin(event) {
        event.preventDefault();
        var email = el.accountEmail.value.trim();
        var password = el.accountPassword.value;
        el.accountLoginError.classList.add("hidden");
        if (!email) return fieldError(el.accountEmail, "Enter your email.");
        if (!password) return fieldError(el.accountPassword, "Enter your password.");
        el.accountLoginSubmit.disabled = true;
        el.accountLoginSubmit.textContent = "Signing in…";
        try {
          await apiFetch("/api/auth/login", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email: email, password: password })
          });
          el.accountPassword.value = "";
          var session = await apiFetch("/api/auth/session");
          await showAccountDashboard(session.user);
          toast("Signed in.", "success");
        } catch (error) {
          el.accountLoginError.textContent = error.message || "Unable to sign in.";
          el.accountLoginError.classList.remove("hidden");
        } finally {
          el.accountLoginSubmit.disabled = false;
          el.accountLoginSubmit.textContent = "Sign in";
        }
      }

      async function accountLogout() {
        try {
          await apiFetch("/api/auth/logout", { method: "POST" });
        } catch (error) {}
        el.accountDashboard.classList.add("hidden");
        el.accountSigninCard.classList.remove("hidden");
        if (el.accountBenefitsCard) el.accountBenefitsCard.classList.remove("hidden");
        if (el.accountLogout) el.accountLogout.classList.add("hidden");
        el.accountEmail.focus();
        toast("Signed out.", "success");
      }

      async function showAccountDashboard(user) {
        el.accountSigninCard.classList.add("hidden");
        if (el.accountBenefitsCard) el.accountBenefitsCard.classList.add("hidden");
        el.accountDashboard.classList.remove("hidden");
        if (el.accountLogout) el.accountLogout.classList.remove("hidden");
        el.accountDisplayName.textContent = user.displayName;
        el.accountEmailDisplay.textContent = user.email;

        if (el.accountAvatar) {
          el.accountAvatar.className = "tier-avatar " + tierRingClass(user.rank);
          el.accountAvatar.style.background = "hsl(" + hashHue(user.displayName || "?") + " 62% 42%)";
          el.accountAvatar.textContent = getInitials(user.displayName);
        }
        el.accountRoleBadge.className = "tier-badge " + tierBadgeClass(user.rank);
        el.accountRoleBadge.textContent = tierBadgeIcon(user.rank) + " " + (user.roleName || "");

        // Plan limits in plain English (V3-PLAN.md section 6) -- no more
        // raw EffectiveLimits key dump.
        el.accountLimitsGrid.textContent = "";
        var lines = [
          "Notes disappear after " + formatDuration(APP.ttlSeconds) + ".",
          "Up to " + Number(APP.maxTextLength).toLocaleString() + " characters per note.",
          "Files up to " + APP.maxFileSizeMB + " MB.",
          "Up to " + APP.maxFilesPerBatch + " files per upload, " + APP.maxBatchTotalMB + " MB total.",
          "Files disappear after " + formatDuration(APP.fileTtlSeconds) + ".",
          "Choose your own link: " + (APP.allowCustomCode ? "Yes" : "No") + ".",
          "Extra encryption: " + (APP.allowClientEncryption ? "Yes" : "No") + "."
        ];
        lines.forEach(function (line) {
          var row = document.createElement("p");
          row.className = "leading-6";
          row.textContent = line;
          el.accountLimitsGrid.appendChild(row);
        });

        await loadAccountShares();
      }

      async function loadAccountShares() {
        try {
          var data = await apiFetch("/api/me/shares");
          renderAccountNotes(data.notes || []);
          renderAccountFiles(data.files || []);
        } catch (error) {
          toast(error.message || "Unable to load your shares.", "error");
        }
      }

      function renderAccountNotes(notes) {
        el.accountNotesList.textContent = "";
        if (!notes.length) {
          var empty = document.createElement("p");
          empty.className = "text-sm text-slate-500";
          empty.textContent = "No notes yet.";
          el.accountNotesList.appendChild(empty);
          return;
        }
        notes.forEach(function (note) {
          var row = document.createElement("article");
          row.className = "note-row";
          var titleWrap = document.createElement("div");
          titleWrap.className = "note-main";
          var meta = document.createElement("div");
          meta.className = "note-meta";
          var lockBadge = document.createElement("span");
          lockBadge.className = "note-badge" + (note.locked ? " badge-locked" : "");
          lockBadge.textContent = note.locked ? "PIN locked" : "Open";
          meta.appendChild(lockBadge);
          if (note.burnAfterRead) {
            var burnBadge = document.createElement("span");
            burnBadge.className = "note-badge badge-burn";
            burnBadge.textContent = "Open once";
            meta.appendChild(burnBadge);
          }
          var title = document.createElement("h3");
          title.className = "note-title";
          title.textContent = note.title;
          var expiry = document.createElement("span");
          expiry.className = "note-expiry";
          expiry.textContent = formatRemaining(note.expiresAt);
          expiry.dataset.expires = String(note.expiresAt);
          titleWrap.appendChild(meta);
          titleWrap.appendChild(title);
          titleWrap.appendChild(expiry);

          var actions = document.createElement("div");
          actions.className = "note-actions";
          var copyButton = document.createElement("button");
          copyButton.type = "button";
          copyButton.className = "rounded-md border border-[var(--line)] px-3 py-1.5 text-xs";
          copyButton.setAttribute("data-action", "account-copy-note");
          copyButton.setAttribute("data-code", note.code);
          copyButton.textContent = "Copy link";
          var qrButton = document.createElement("button");
          qrButton.type = "button";
          qrButton.className = "icon-button";
          qrButton.setAttribute("data-action", "account-qr-note");
          qrButton.setAttribute("data-account-note-id", note.id);
          qrButton.setAttribute("data-code", note.code);
          qrButton.setAttribute("aria-label", "Show share code and QR");
          qrButton.innerHTML = '<svg viewBox="0 0 24 24" class="h-4 w-4"><use href="#i-qr-grid"></use></svg>';
          var editButton = document.createElement("button");
          editButton.type = "button";
          editButton.className = "rounded-md border border-[var(--line)] px-3 py-1.5 text-xs";
          editButton.setAttribute("data-action", "account-edit-note");
          editButton.setAttribute("data-account-note-id", note.id);
          editButton.textContent = "Edit";
          var shareButton = document.createElement("button");
          shareButton.type = "button";
          shareButton.className = "rounded-md border border-[var(--line)] px-3 py-1.5 text-xs";
          shareButton.setAttribute("data-action", "account-share-note");
          shareButton.setAttribute("data-account-note-id", note.id);
          shareButton.textContent = "Share to this network";
          var deleteButton = document.createElement("button");
          deleteButton.type = "button";
          deleteButton.className = "rounded-md border border-red-500/30 px-3 py-1.5 text-xs text-red-300";
          deleteButton.setAttribute("data-action", "account-delete-note");
          deleteButton.setAttribute("data-account-note-id", note.id);
          deleteButton.textContent = "Delete";
          var openButton = document.createElement("button");
          openButton.type = "button";
          openButton.className = "action-btn primary-action";
          openButton.textContent = "Open";
          openButton.addEventListener("click", function () { openOwnedDrop("note", note.id); });
          title.classList.add("clickable-drop-title");
          title.tabIndex = 0;
          title.setAttribute("role", "button");
          title.addEventListener("click", function () { openOwnedDrop("note", note.id); });
          title.addEventListener("keydown", function (event) { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openOwnedDrop("note", note.id); } });
          actions.appendChild(openButton);
          actions.appendChild(copyButton);
          actions.appendChild(qrButton);
          actions.appendChild(editButton);
          if (!note.burnAfterRead) actions.appendChild(shareButton);
          actions.appendChild(deleteButton);
          row.appendChild(titleWrap);
          row.appendChild(actions);
          el.accountNotesList.appendChild(row);
        });
      }

      function renderAccountFiles(files) {
        el.accountFilesList.textContent = "";
        if (!files.length) {
          var empty = document.createElement("p");
          empty.className = "text-sm text-slate-500";
          empty.textContent = "No files yet.";
          el.accountFilesList.appendChild(empty);
          return;
        }
        files.forEach(function (group) {
          var row = document.createElement("article");
          row.className = "note-row";
          var titleWrap = document.createElement("div");
          titleWrap.className = "note-main";
          var meta = document.createElement("div");
          meta.className = "note-meta";
          var lockBadge = document.createElement("span");
          lockBadge.className = "note-badge" + (group.locked ? " badge-locked" : "");
          lockBadge.textContent = group.locked ? "PIN locked" : "Open";
          meta.appendChild(lockBadge);
          var countBadge = document.createElement("span");
          countBadge.className = "note-badge";
          countBadge.textContent = group.fileCount + (group.fileCount === 1 ? " file" : " files") + " · " + formatBytes(group.totalSizeBytes);
          meta.appendChild(countBadge);
          if (group.burnAfterRead) {
            var burnBadge = document.createElement("span");
            burnBadge.className = "note-badge badge-burn";
            burnBadge.textContent = "Open once";
            meta.appendChild(burnBadge);
          }
          var title = document.createElement("h3");
          title.className = "note-title";
          title.textContent = group.title;
          var expiry = document.createElement("span");
          expiry.className = "note-expiry";
          expiry.textContent = formatRemaining(group.expiresAt);
          expiry.dataset.expires = String(group.expiresAt);
          titleWrap.appendChild(meta);
          titleWrap.appendChild(title);
          titleWrap.appendChild(expiry);

          var actions = document.createElement("div");
          actions.className = "note-actions";
          var copyButton = document.createElement("button");
          copyButton.type = "button";
          copyButton.className = "rounded-md border border-[var(--line)] px-3 py-1.5 text-xs";
          copyButton.setAttribute("data-action", "account-copy-file");
          copyButton.setAttribute("data-code", group.code);
          copyButton.textContent = "Copy link";
          var qrButton = document.createElement("button");
          qrButton.type = "button";
          qrButton.className = "icon-button";
          qrButton.setAttribute("data-action", "account-qr-file");
          qrButton.setAttribute("data-account-file-id", group.id);
          qrButton.setAttribute("data-code", group.code);
          qrButton.setAttribute("aria-label", "Show share code and QR");
          qrButton.innerHTML = '<svg viewBox="0 0 24 24" class="h-4 w-4"><use href="#i-qr-grid"></use></svg>';
          var editButton = document.createElement("button");
          editButton.type = "button";
          editButton.className = "rounded-md border border-[var(--line)] px-3 py-1.5 text-xs";
          editButton.setAttribute("data-action", "account-edit-file");
          editButton.setAttribute("data-account-file-id", group.id);
          editButton.textContent = "Edit";
          var shareButton = document.createElement("button");
          shareButton.type = "button";
          shareButton.className = "rounded-md border border-[var(--line)] px-3 py-1.5 text-xs";
          shareButton.setAttribute("data-action", "account-share-file");
          shareButton.setAttribute("data-account-file-id", group.id);
          shareButton.textContent = "Share to this network";
          var deleteButton = document.createElement("button");
          deleteButton.type = "button";
          deleteButton.className = "rounded-md border border-red-500/30 px-3 py-1.5 text-xs text-red-300";
          deleteButton.setAttribute("data-action", "account-delete-file");
          deleteButton.setAttribute("data-account-file-id", group.id);
          deleteButton.textContent = "Delete";
          var openButton = document.createElement("button");
          openButton.type = "button";
          openButton.className = "action-btn primary-action";
          openButton.textContent = "Open";
          openButton.addEventListener("click", function () { openOwnedDrop("file", group.id); });
          title.classList.add("clickable-drop-title");
          title.tabIndex = 0;
          title.setAttribute("role", "button");
          title.addEventListener("click", function () { openOwnedDrop("file", group.id); });
          title.addEventListener("keydown", function (event) { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openOwnedDrop("file", group.id); } });
          actions.appendChild(openButton);
          actions.appendChild(copyButton);
          actions.appendChild(qrButton);
          actions.appendChild(editButton);
          if (!group.burnAfterRead) actions.appendChild(shareButton);
          actions.appendChild(deleteButton);
          row.appendChild(titleWrap);
          row.appendChild(actions);
          el.accountFilesList.appendChild(row);
        });
      }

      async function deleteAccountNote(noteId) {
        try {
          await apiFetch("/api/me/shares/notes/" + encodeURIComponent(noteId), { method: "DELETE" });
          toast("Note deleted.", "success");
          await loadAccountShares();
        } catch (error) {
          toast(error.message || "Unable to delete note.", "error");
        }
      }

      async function deleteAccountFile(groupId) {
        try {
          await apiFetch("/api/me/shares/files/" + encodeURIComponent(groupId), { method: "DELETE" });
          toast("File deleted.", "success");
          await loadAccountShares();
        } catch (error) {
          toast(error.message || "Unable to delete file.", "error");
        }
      }

      async function submitAccountRequest(event) {
        event.preventDefault();
        var name = el.accountRequestName.value.trim();
        var email = el.accountRequestEmail.value.trim();
        var reason = el.accountRequestReason.value.trim();
        el.accountRequestStatus.classList.add("hidden");
        if (!name) return fieldError(el.accountRequestName, "Add your name.");
        if (!email) return fieldError(el.accountRequestEmail, "Add your email.");
        if (!reason) return fieldError(el.accountRequestReason, "Tell us why you need an account.");
        el.accountRequestSubmit.disabled = true;
        el.accountRequestSubmit.textContent = "Submitting…";
        try {
          await apiFetch("/api/feedback", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              category: "account_request",
              email: email,
              message: "Name: " + name + "\n\n" + reason
            })
          });
          el.accountRequestForm.reset();
          el.accountRequestStatus.textContent = "Request submitted. The admin will review it.";
          el.accountRequestStatus.classList.remove("hidden");
          toast("Account request submitted.", "success");
        } catch (error) {
          toast(error.message || "Unable to submit request.", "error");
        } finally {
          el.accountRequestSubmit.disabled = false;
          el.accountRequestSubmit.textContent = "Request an account";
        }
      }

      async function changeAccountPassword(event) {
        event.preventDefault();
        var currentPassword = el.accountCurrentPassword.value;
        var newPassword = el.accountNewPassword.value;
        var confirmPassword = el.accountConfirmPassword.value;
        el.accountPasswordStatus.classList.add("hidden");
        if (!currentPassword) return fieldError(el.accountCurrentPassword, "Enter your current password.");
        if (newPassword.length < 8) return fieldError(el.accountNewPassword, "New password must be at least 8 characters.");
        if (newPassword !== confirmPassword) return fieldError(el.accountConfirmPassword, "Passwords do not match.");
        el.accountPasswordSubmit.disabled = true;
        el.accountPasswordSubmit.textContent = "Updating…";
        try {
          await apiFetch("/api/me/password", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ currentPassword: currentPassword, newPassword: newPassword })
          });
          el.accountPasswordForm.reset();
          el.accountPasswordStatus.textContent = "Password updated.";
          el.accountPasswordStatus.classList.remove("hidden");
          toast("Password updated.", "success");
        } catch (error) {
          toast(error.message || "Unable to update password.", "error");
        } finally {
          el.accountPasswordSubmit.disabled = false;
          el.accountPasswordSubmit.textContent = "Update password";
        }
      }

      async function initAdmin() {
        try {
          var session = await apiFetch("/api/admin/session");
          if (!session.configured) {
            el.adminLoginHelp.textContent = "No admin account exists yet. Create one directly in the users table, then refresh this page.";
            el.adminEmail.disabled = true;
            el.adminPassword.disabled = true;
            el.adminLoginSubmit.disabled = true;
            return;
          }
          if (session.authenticated) {
            showAdminDashboard();
            await loadAdminOverview();
          } else {
            el.adminPassword.focus();
          }
        } catch (error) {
          el.adminLoginHelp.textContent = error.message || "Unable to check the administrator session.";
        }
      }

      async function adminLogin(event) {
        event.preventDefault();
        var email = el.adminEmail.value.trim();
        var password = el.adminPassword.value;
        if (!email) return fieldError(el.adminEmail, "Enter your email.");
        if (!password) return fieldError(el.adminPassword, "Enter your password.");
        el.adminLoginSubmit.disabled = true;
        el.adminLoginSubmit.textContent = "Signing in…";
        try {
          await apiFetch("/api/admin/login", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email: email, password: password })
          });
          el.adminPassword.value = "";
          showAdminDashboard();
          await loadAdminOverview();
          toast("Signed in.", "success");
        } catch (error) {
          toast(error.message || "Unable to sign in.", "error");
          el.adminPassword.select();
        } finally {
          el.adminLoginSubmit.disabled = false;
          el.adminLoginSubmit.textContent = "Sign in";
        }
      }

      async function adminLogout() {
        try {
          await apiFetch("/api/admin/logout", { method: "POST" });
        } catch (error) {}
        el.adminDashboard.classList.add("hidden");
        el.adminLoginCard.classList.remove("hidden");
        if (el.adminLoginHeader) el.adminLoginHeader.classList.remove("hidden-force");
        el.adminPassword.focus();
        toast("Signed out.", "success");
      }

      function showAdminDashboard() {
        el.adminLoginCard.classList.add("hidden");
        if (el.adminLoginHeader) el.adminLoginHeader.classList.add("hidden-force");
        el.adminDashboard.classList.remove("hidden");
        switchAdminTab("overview");
      }

      function switchAdminTab(tabName) {
        state.admin.activeTab = tabName;
        if (el.adminSearch) el.adminSearch.value = "";
        el.adminTabs.forEach(function (tab) {
          var active = tab.getAttribute("data-admin-tab") === tabName;
          tab.classList.toggle("active", active);
          tab.setAttribute("aria-selected", active ? "true" : "false");
        });
        el.adminTabPanels.forEach(function (panel) {
          panel.classList.toggle("hidden", panel.getAttribute("data-admin-panel") !== tabName);
        });
      }

      /** Dispatches to the right loader when a sidebar tab is opened. Each
       *  tab's data is fetched lazily (Phase 8's split endpoints are cheap,
       *  targeted queries -- there's no longer one big /dashboard payload to
       *  share), and re-fetched every time the tab is revisited so admins
       *  always see current data without a manual refresh. */
      function loadAdminTabData(name) {
        if (name === "overview") loadAdminOverview();
        else if (name === "drops") loadAdminDrops();
        else if (name === "users") loadAdminUsersPage();
        else if (name === "inbox") loadAdminInbox();
        else if (name === "settings") loadAdminSettingsTab();
      }

      /** Dispatches the topbar search box to whichever tab is currently open.
       *  Overview/Settings have nothing to search; Inbox's endpoint has no
       *  free-text q param (status/category only), so it's a no-op there too. */
      function handleAdminTopSearch(value) {
        if (state.admin.activeTab === "drops") {
          if (el.adminDropsSearch) el.adminDropsSearch.value = value;
          state.admin.drops.q = value;
          state.admin.drops.page = 1;
          loadAdminDrops();
        } else if (state.admin.activeTab === "users") {
          if (el.adminUsersSearch) el.adminUsersSearch.value = value;
          state.admin.users.q = value;
          state.admin.users.page = 1;
          loadAdminUsersPage();
        }
      }

      /* ------------------------------------------------------------ */
      /* Overview -- GET /api/admin/overview + GET /api/admin/audit    */
      /* ------------------------------------------------------------ */

      async function loadAdminOverview() {
        if (el.adminRefresh) { el.adminRefresh.disabled = true; el.adminRefresh.textContent = "Refreshing…"; }
        try {
          var data = await adminFetch("/api/admin/overview");
          await ensureActorLookupLoaded();
          var auditData = await adminFetch("/api/admin/audit?page=1&pageSize=20").catch(function () { return { items: [] }; });
          renderAdminOverview(data, auditData.items || []);
          if (el.adminHealthD1) el.adminHealthD1.classList.add("ok");
          if (el.adminHealthR2) {
            el.adminHealthR2.classList.toggle("ok", Boolean(data.storage && data.storage.filesBucketConfigured));
            el.adminHealthR2.classList.toggle("down", !(data.storage && data.storage.filesBucketConfigured));
          }
          updateInboxBadge(data.needsAttention || {});
        } catch (error) {
          if (error.status === 401) {
            el.adminDashboard.classList.add("hidden");
            el.adminLoginCard.classList.remove("hidden");
            if (el.adminLoginHeader) el.adminLoginHeader.classList.remove("hidden-force");
          }
          if (el.adminHealthD1) el.adminHealthD1.classList.add("down");
          toast(error.message || "Unable to load the overview.", "error");
        } finally {
          if (el.adminRefresh) { el.adminRefresh.disabled = false; el.adminRefresh.textContent = "Refresh"; }
        }
      }

      function updateInboxBadge(needsAttention) {
        if (!el.adminInboxBadge) return;
        var count = Number(needsAttention.newFeedbackCount || 0) + Number(needsAttention.pendingAccountRequests || 0);
        el.adminInboxBadge.textContent = String(count);
        el.adminInboxBadge.classList.toggle("hidden", count === 0);
      }

      function trendDelta(trend) {
        var pct = Number((trend && trend.deltaPercent) || 0);
        if (pct > 0) return { text: "▲ " + pct + "%", cls: "up" };
        if (pct < 0) return { text: "▼ " + Math.abs(pct) + "%", cls: "down" };
        return { text: "No change", cls: "flat" };
      }

      function renderAdminOverview(data, auditItems) {
        var stats = data.stats || {};
        var trends = data.trends || {};
        var attention = data.needsAttention || {};

        var cards = [
          ["Notes created", trends.notesCreated],
          ["Files created", trends.filesCreated],
          ["Feedback received", trends.feedbackReceived]
        ];
        el.adminKpis.textContent = "";
        cards.forEach(function (card) {
          var trend = card[1] || { current: 0, prior: 0, deltaPercent: 0 };
          var delta = trendDelta(trend);
          var node = document.createElement("article");
          node.className = "stat-card";
          var label = document.createElement("p");
          label.className = "text-xs font-semibold uppercase tracking-wider text-slate-500";
          label.textContent = card[0] + " (7d)";
          var value = document.createElement("p");
          value.className = "stat-value";
          value.textContent = Number(trend.current || 0).toLocaleString();
          var trendLine = document.createElement("p");
          trendLine.className = "stat-trend " + delta.cls;
          trendLine.textContent = delta.text + " vs prior 7d";
          node.appendChild(label);
          node.appendChild(value);
          node.appendChild(trendLine);
          el.adminKpis.appendChild(node);
        });
        var activeNode = document.createElement("article");
        activeNode.className = "stat-card";
        var activeLabel = document.createElement("p");
        activeLabel.className = "text-xs font-semibold uppercase tracking-wider text-slate-500";
        activeLabel.textContent = "Active drops";
        var activeValue = document.createElement("p");
        activeValue.className = "stat-value";
        activeValue.textContent = (Number(stats.activeNotes || 0) + Number(stats.activeFiles || 0)).toLocaleString();
        var activeCaption = document.createElement("p");
        activeCaption.className = "stat-trend flat";
        activeCaption.textContent = "Right now";
        activeNode.appendChild(activeLabel);
        activeNode.appendChild(activeValue);
        activeNode.appendChild(activeCaption);
        el.adminKpis.appendChild(activeNode);

        el.adminAttention.textContent = "";
        var attentionRows = [
          ["New feedback", attention.newFeedbackCount || 0, "inbox", "feedback", false],
          ["Pending account requests", attention.pendingAccountRequests || 0, "inbox", "requests", false],
          ["Storage used", (attention.storagePercentUsed || 0) + "%", "drops", null, (attention.storagePercentUsed || 0) > 80],
          ["Failed logins (24h)", attention.recentFailedLogins || 0, null, null, Number(attention.recentFailedLogins || 0) > 0]
        ];
        attentionRows.forEach(function (row) {
          var wrap = document.createElement("div");
          wrap.className = "attention-row";
          var label = document.createElement("span");
          label.textContent = row[0];
          var value = document.createElement("span");
          value.className = "attention-value" + (row[4] ? " warn" : "");
          value.textContent = String(row[1]);
          wrap.appendChild(label);
          if (row[2]) {
            var link = document.createElement("button");
            link.type = "button";
            link.className = "rounded-md border-0 bg-transparent p-0 text-xs";
            link.setAttribute("data-action", "admin-goto-tab");
            link.setAttribute("data-admin-goto", row[2]);
            if (row[3]) link.setAttribute("data-inbox-goto", row[3]);
            link.appendChild(value);
            wrap.appendChild(link);
          } else {
            wrap.appendChild(value);
          }
          el.adminAttention.appendChild(wrap);
        });

        el.adminTrendChart.textContent = "";
        [["Notes created", trends.notesCreated], ["Files created", trends.filesCreated], ["Feedback received", trends.feedbackReceived]]
          .forEach(function (pair) {
            var trend = pair[1] || { current: 0, prior: 0 };
            var maximum = Math.max(1, Number(trend.current || 0), Number(trend.prior || 0));
            var row = document.createElement("div");
            row.className = "trend-bar-row";
            var label = document.createElement("p");
            label.className = "text-xs text-slate-500";
            label.textContent = pair[0] + " — this week " + Number(trend.current || 0) + ", last week " + Number(trend.prior || 0);
            var track1 = document.createElement("div");
            track1.className = "trend-bar-track";
            var fill1 = document.createElement("div");
            fill1.className = "trend-bar-fill";
            fill1.style.width = Math.round((Number(trend.current || 0) / maximum) * 100) + "%";
            track1.appendChild(fill1);
            var track2 = document.createElement("div");
            track2.className = "trend-bar-track";
            var fill2 = document.createElement("div");
            fill2.className = "trend-bar-fill prior";
            fill2.style.width = Math.round((Number(trend.prior || 0) / maximum) * 100) + "%";
            track2.appendChild(fill2);
            row.appendChild(label);
            row.appendChild(track1);
            row.appendChild(track2);
            el.adminTrendChart.appendChild(row);
          });

        renderAdminActivityFeed(auditItems);
      }

      /** Plain-English sentence per audit action (V3-PLAN 7.2's "recent
       *  activity feed"). actorEmail isn't populated server-side today (only
       *  actorUserId is recorded -- see src/lib/audit.ts's RecordAuditParams
       *  and every recordAudit() call site in admin.ts/users.ts), so the
       *  actor's identity is resolved client-side against the cached user
       *  list (see ensureActorLookupLoaded/state.admin.usersById) instead of
       *  reading a field the API never fills in. */
      var ADMIN_ACTION_SENTENCES = {
        settings_updated: "updated settings",
        note_deleted: "deleted a note",
        file_deleted: "deleted a file",
        feedback_status_changed: "changed a feedback status",
        feedback_deleted: "deleted a feedback submission",
        drops_bulk_deleted: "bulk-deleted drops",
        user_created: "created an account",
        user_updated: "updated an account",
        user_deleted: "deleted an account",
        role_updated: "updated a role"
      };

      function describeAuditActor(item) {
        if (item.actorEmail) return item.actorEmail;
        if (item.actorUserId && state.admin.usersById[item.actorUserId]) {
          return state.admin.usersById[item.actorUserId].email;
        }
        return "An admin";
      }

      function describeAuditAction(item) {
        var sentence = ADMIN_ACTION_SENTENCES[item.action] || ("performed " + item.action.replace(/_/g, " "));
        if (item.action === "drops_bulk_deleted" && item.after && typeof item.after.deleted === "number") {
          sentence = "bulk-deleted " + item.after.deleted + " drop" + (item.after.deleted === 1 ? "" : "s");
        }
        return describeAuditActor(item) + " " + sentence + ".";
      }

      function renderAdminActivityFeed(items) {
        el.adminActivityFeed.textContent = "";
        if (!items.length) {
          el.adminActivityFeed.textContent = "No recent activity.";
          return;
        }
        items.forEach(function (item) {
          var row = document.createElement("div");
          row.className = "flex items-center justify-between gap-4 border-b border-[var(--line)] pb-3";
          var text = document.createElement("span");
          text.textContent = describeAuditAction(item);
          var time = document.createElement("span");
          time.className = "text-xs text-slate-500";
          time.textContent = formatDate(item.createdAt);
          row.appendChild(text);
          row.appendChild(time);
          el.adminActivityFeed.appendChild(row);
        });
      }

      /* ------------------------------------------------------------ */
      /* Drops -- GET /api/admin/drops + POST /api/admin/drops/bulk-delete */
      /* ------------------------------------------------------------ */

      function renderStorageBar(storage) {
        if (!el.adminStorageFill || !el.adminStorageLabel) return;
        var used = Number((storage && storage.fileStorageBytes) || 0);
        var cap = Number((storage && storage.fileStorageLimitBytes) || 1);
        var pct = Math.min(100, Math.round((used / cap) * 100));
        el.adminStorageFill.style.width = pct + "%";
        el.adminStorageLabel.textContent = formatBytes(used) + " used of " + formatBytes(cap) + " (" + pct + "%)";
        if (!el.adminStorageWarning) return;
        if (!storage || !storage.filesBucketConfigured) {
          el.adminStorageWarning.textContent = "No R2 bucket bound as FILES_BUCKET yet — file sharing will return an error until one is added in Cloudflare.";
          el.adminStorageWarning.classList.remove("hidden");
        } else if (pct >= 90) {
          el.adminStorageWarning.textContent = "Storage is nearly full. Raise the cap or clear old drops below.";
          el.adminStorageWarning.classList.remove("hidden");
        } else {
          el.adminStorageWarning.classList.add("hidden");
        }
      }

      async function loadAdminDrops() {
        if (!el.adminDropsList) return;
        el.adminDropsList.textContent = "Loading…";
        try {
          var d = state.admin.drops;
          var params = new URLSearchParams();
          params.set("page", String(d.page));
          params.set("pageSize", String(d.pageSize));
          if (d.q) params.set("q", d.q);
          if (d.type) params.set("type", d.type);
          if (d.filter) params.set("filter", d.filter);
          if (d.sort) params.set("sort", d.sort);
          var data = await adminFetch("/api/admin/drops?" + params.toString());
          d.total = data.total;
          renderAdminDrops(data.items || []);
          renderDropsPagination();
          // Storage bar lives on this page (V3-PLAN 7.3) but the figure comes
          // from /api/admin/overview, the only endpoint that computes it --
          // a light, read-only reuse of that endpoint, not a new one.
          adminFetch("/api/admin/overview").then(function (overview) {
            renderStorageBar(overview.storage || {});
          }).catch(function () {});
        } catch (error) {
          el.adminDropsList.textContent = "";
          toast(error.message || "Unable to load drops.", "error");
        }
      }

      function renderAdminDrops(items) {
        el.adminDropsList.textContent = "";
        if (!items.length) {
          el.adminDropsList.textContent = "No drops match these filters.";
          updateBulkDeleteButton();
          return;
        }
        items.forEach(function (item) {
          var key = item.type + ":" + item.id;
          var row = document.createElement("div");
          row.className = "admin-row";

          var checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.checked = Boolean(state.admin.drops.selected[key]);
          checkbox.addEventListener("change", function () { toggleDropSelection(item.type, item.id, checkbox.checked); });

          var main = document.createElement("div");
          main.className = "admin-row-main";
          var title = document.createElement("span");
          title.className = "admin-row-title";
          title.textContent = item.title;
          var meta = document.createElement("div");
          meta.className = "admin-row-meta";

          var typeBadge = document.createElement("span");
          typeBadge.className = "note-badge";
          typeBadge.textContent = item.type === "file" ? "File" : "Note";
          meta.appendChild(typeBadge);

          var codeSpan = document.createElement("span");
          codeSpan.textContent = item.code;
          meta.appendChild(codeSpan);

          if (item.locked) {
            var lockedBadge = document.createElement("span");
            lockedBadge.className = "note-badge badge-locked";
            lockedBadge.textContent = "Locked";
            meta.appendChild(lockedBadge);
          }
          // The drops list endpoint can *filter* by burn-after-read but its
          // SELECT doesn't project the column back out per-row, so an
          // "Open once" badge can only be shown while that filter is active
          // (every visible row is then known to match it) -- see the note in
          // this file's final report about src/routes/admin.ts's DropRow.
          if (item.burnAfterRead) {
            var burnBadge = document.createElement("span");
            burnBadge.className = "note-badge badge-burn";
            burnBadge.textContent = "Open once";
            meta.appendChild(burnBadge);
          }

          if (item.ownerDisplayName) {
            var ownerBadge = document.createElement("span");
            ownerBadge.className = "tier-badge " + tierBadgeClass(item.ownerRank);
            ownerBadge.textContent = tierBadgeIcon(item.ownerRank) + " " + item.ownerDisplayName;
            meta.appendChild(ownerBadge);
          } else {
            var anon = document.createElement("span");
            anon.textContent = "Anonymous";
            meta.appendChild(anon);
          }

          var sizeSpan = document.createElement("span");
          sizeSpan.textContent = item.totalSizeBytes == null ? "—" : formatBytes(item.totalSizeBytes);
          meta.appendChild(sizeSpan);

          var expirySpan = document.createElement("span");
          expirySpan.setAttribute("data-expires", String(item.expiresAt));
          expirySpan.textContent = formatRemaining(item.expiresAt);
          meta.appendChild(expirySpan);

          main.appendChild(title);
          main.appendChild(meta);

          var actions = document.createElement("div");
          actions.className = "admin-row-actions";
          var editButton = document.createElement("button");
          editButton.type = "button";
          editButton.className = "rounded-md border border-[var(--line)] px-3 py-2 text-xs";
          editButton.setAttribute("data-action", "admin-edit-drop");
          editButton.setAttribute("data-drop-type", item.type);
          editButton.setAttribute("data-drop-id", item.id);
          editButton.setAttribute("data-drop-title", item.title);
          editButton.textContent = "Edit";
          var deleteButton = document.createElement("button");
          deleteButton.type = "button";
          deleteButton.className = "rounded-md border border-red-500/30 px-3 py-2 text-xs text-red-300";
          deleteButton.setAttribute("data-action", "admin-delete-drop");
          deleteButton.setAttribute("data-drop-type", item.type);
          deleteButton.setAttribute("data-drop-id", item.id);
          deleteButton.textContent = "Delete";
          actions.appendChild(editButton);
          actions.appendChild(deleteButton);

          row.appendChild(checkbox);
          row.appendChild(main);
          row.appendChild(actions);
          el.adminDropsList.appendChild(row);
        });
        updateBulkDeleteButton();
      }

      function renderDropsPagination() {
        if (!el.adminDropsPagination) return;
        var d = state.admin.drops;
        var totalPages = Math.max(1, Math.ceil(d.total / d.pageSize));
        el.adminDropsPagination.textContent = "";
        var prev = document.createElement("button");
        prev.type = "button";
        prev.textContent = "Previous";
        prev.disabled = d.page <= 1;
        prev.setAttribute("data-action", "admin-drops-page-prev");
        var label = document.createElement("span");
        label.textContent = "Page " + d.page + " of " + totalPages + " · " + d.total + " total";
        var next = document.createElement("button");
        next.type = "button";
        next.textContent = "Next";
        next.disabled = d.page >= totalPages;
        next.setAttribute("data-action", "admin-drops-page-next");
        el.adminDropsPagination.appendChild(prev);
        el.adminDropsPagination.appendChild(label);
        el.adminDropsPagination.appendChild(next);
      }

      function changeDropsPage(delta) {
        var d = state.admin.drops;
        var totalPages = Math.max(1, Math.ceil(d.total / d.pageSize));
        d.page = Math.max(1, Math.min(totalPages, d.page + delta));
        loadAdminDrops();
      }

      function toggleDropSelection(type, id, checked) {
        var key = type + ":" + id;
        if (checked) state.admin.drops.selected[key] = true;
        else delete state.admin.drops.selected[key];
        updateBulkDeleteButton();
      }

      function toggleSelectAllDrops(checked) {
        el.adminDropsList.querySelectorAll('input[type="checkbox"]').forEach(function (box) {
          if (box.checked !== checked) box.click();
        });
      }

      function updateBulkDeleteButton() {
        if (!el.adminDropsBulkDelete) return;
        var count = Object.keys(state.admin.drops.selected).length;
        el.adminDropsBulkDelete.classList.toggle("hidden", count === 0);
        el.adminDropsBulkDelete.textContent = "Delete selected (" + count + ")";
      }

      async function submitDropsBulkDelete() {
        var keys = Object.keys(state.admin.drops.selected);
        if (!keys.length) return;
        if (!window.confirm("Delete " + keys.length + " selected drop(s) now? This cannot be undone.")) return;
        var items = keys.map(function (key) {
          var parts = key.split(":");
          return { type: parts[0], id: parts.slice(1).join(":") };
        });
        try {
          var result = await adminFetch("/api/admin/drops/bulk-delete", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ items: items })
          });
          toast(result.deleted + " drop(s) deleted" + (result.failed ? ", " + result.failed + " failed" : "") + ".", "success");
          state.admin.drops.selected = Object.create(null);
          await loadAdminDrops();
        } catch (error) {
          toast(error.message || "Unable to delete the selected drops.", "error");
        }
      }

      async function adminDeleteDrop(type, id) {
        if (!window.confirm("Delete this " + type + " now?")) return;
        try {
          if (type === "note") {
            await adminFetch("/api/admin/item/" + encodeURIComponent(id), { method: "DELETE" });
            toast("Note deleted.", "success");
          } else {
            await adminFetch("/api/admin/file/" + encodeURIComponent(id), { method: "DELETE" });
            toast("File deleted.", "success");
          }
          await loadAdminDrops();
        } catch (error) {
          toast(error.message || "Unable to delete this drop.", "error");
        }
      }

      /* ------------------------------------------------------------ */
      /* Users -- GET /api/admin/users (paginated) + limits form        */
      /* ------------------------------------------------------------ */

      var adminRolesCache = [];

      /** Builds/refreshes the userId->{email,displayName} lookup the activity
       *  feed uses to resolve actorUserId into a readable identity (see
       *  describeAuditActor above). Loads the full unpaginated user list once
       *  per admin session and whenever the Users tab is opened. */
      async function ensureActorLookupLoaded() {
        if (Object.keys(state.admin.usersById).length) return;
        try {
          var usersData = await adminFetch("/api/admin/users");
          (usersData.users || []).forEach(function (user) {
            state.admin.usersById[user.id] = user;
          });
        } catch (error) {}
      }

      async function loadAdminUsersPage() {
        if (!el.adminUsers) return;
        el.adminUsers.textContent = "Loading…";
        try {
          if (!adminRolesCache.length) {
            var rolesData = await adminFetch("/api/admin/roles");
            adminRolesCache = rolesData.roles;
            renderAdminRoles(rolesData.roles);
            populateRoleSelect(rolesData.roles);
            populateRoleFilterSelect(rolesData.roles);
          }
          var u = state.admin.users;
          var params = new URLSearchParams();
          params.set("page", String(u.page));
          params.set("pageSize", String(u.pageSize));
          if (u.q) params.set("q", u.q);
          if (u.role) params.set("role", u.role);
          if (u.status) params.set("status", u.status);
          var usersData = await adminFetch("/api/admin/users?" + params.toString());
          u.total = usersData.total;
          usersData.users.forEach(function (user) { state.admin.usersById[user.id] = user; });
          renderAdminUsersList(usersData.users, adminRolesCache);
          renderUsersPagination();
        } catch (error) {
          el.adminUsers.textContent = "";
          toast(error.message || "Unable to load accounts.", "error");
        }
      }

      function populateRoleSelect(roles) {
        if (!el.newUserRole) return;
        el.newUserRole.textContent = "";
        roles.forEach(function (role) {
          var option = document.createElement("option");
          option.value = String(role.id);
          option.textContent = role.name;
          el.newUserRole.appendChild(option);
        });
      }

      function populateRoleFilterSelect(roles) {
        if (!el.adminUsersRoleFilter) return;
        var current = el.adminUsersRoleFilter.value;
        el.adminUsersRoleFilter.textContent = "";
        var allOption = document.createElement("option");
        allOption.value = "";
        allOption.textContent = "All roles";
        el.adminUsersRoleFilter.appendChild(allOption);
        roles.forEach(function (role) {
          var option = document.createElement("option");
          option.value = String(role.id);
          option.textContent = role.name;
          el.adminUsersRoleFilter.appendChild(option);
        });
        el.adminUsersRoleFilter.value = current;
      }

      /* Per-EffectiveLimits-field form config -- replaces the raw JSON
       * textarea (V3-PLAN 7.4). numeric fields get a number input; boolean
       * fields get a checkbox. Each has an "inherit from role" checkbox that,
       * when checked, omits that key from the customLimits payload entirely
       * so the server's role/custom merge (limits.ts) falls back cleanly. */
      var LIMITS_FIELDS = [
        ["ttlSeconds", "Note expiry (seconds)", "number"],
        ["maxTextLength", "Max text length", "number"],
        ["maxFileSizeMB", "Max file size (MB)", "number"],
        ["maxBatchTotalMB", "Max batch total (MB)", "number"],
        ["maxFilesPerBatch", "Max files per batch", "number"],
        ["fileTtlSeconds", "File expiry (seconds)", "number"],
        ["allowCustomCode", "Allow custom share codes", "boolean"],
        ["allowClientEncryption", "Allow client-side encryption", "boolean"]
      ];

      function buildUserLimitsForm(user) {
        var custom = user.customLimits || {};
        var form = document.createElement("div");
        form.className = "limits-form";
        form.setAttribute("data-limits-user-id", user.id);
        var grid = document.createElement("div");
        grid.className = "limits-form-grid";
        LIMITS_FIELDS.forEach(function (field) {
          var key = field[0], caption = field[1], type = field[2];
          var hasOverride = Object.prototype.hasOwnProperty.call(custom, key);
          var wrap = document.createElement("label");
          wrap.className = "limits-field";
          var captionNode = document.createElement("span");
          captionNode.textContent = caption;
          var input = document.createElement("input");
          input.setAttribute("data-limits-field", key);
          if (type === "boolean") {
            input.type = "checkbox";
            input.checked = Boolean(hasOverride ? custom[key] : false);
          } else {
            input.type = "number";
            input.className = "form-field";
            input.value = hasOverride ? custom[key] : "";
            input.placeholder = "Role default";
          }
          input.disabled = !hasOverride;
          var inheritWrap = document.createElement("span");
          inheritWrap.className = "limits-field-inherit";
          var inheritBox = document.createElement("input");
          inheritBox.type = "checkbox";
          inheritBox.checked = !hasOverride;
          inheritBox.addEventListener("change", function () { input.disabled = inheritBox.checked; });
          var inheritLabel = document.createElement("span");
          inheritLabel.textContent = "Inherit from role";
          inheritWrap.appendChild(inheritBox);
          inheritWrap.appendChild(inheritLabel);
          inheritWrap.setAttribute("data-limits-inherit", key);
          wrap.appendChild(captionNode);
          wrap.appendChild(input);
          wrap.appendChild(inheritWrap);
          grid.appendChild(wrap);
        });
        form.appendChild(grid);
        var saveButton = document.createElement("button");
        saveButton.type = "button";
        saveButton.className = "primary-action mt-3 px-4 py-2 text-sm font-semibold";
        saveButton.setAttribute("data-action", "admin-save-user-limits");
        saveButton.setAttribute("data-user-id", user.id);
        saveButton.textContent = "Save limits";
        form.appendChild(saveButton);
        return form;
      }

      function buildUserEditForm(user) {
        var form = document.createElement("div");
        form.className = "limits-form";
        form.setAttribute("data-edit-user-id", user.id);

        var emailWrap = document.createElement("label");
        emailWrap.className = "limits-field";
        var emailCaption = document.createElement("span");
        emailCaption.textContent = "Email (fixed)";
        var emailInput = document.createElement("input");
        emailInput.type = "email";
        emailInput.className = "form-field";
        emailInput.value = user.email;
        emailInput.disabled = true;
        emailWrap.appendChild(emailCaption);
        emailWrap.appendChild(emailInput);

        var nameWrap = document.createElement("label");
        nameWrap.className = "limits-field";
        var nameCaption = document.createElement("span");
        nameCaption.textContent = "Display name";
        var nameInput = document.createElement("input");
        nameInput.type = "text";
        nameInput.className = "form-field";
        nameInput.maxLength = 80;
        nameInput.value = user.displayName;
        nameInput.setAttribute("data-edit-field", "displayName");
        nameWrap.appendChild(nameCaption);
        nameWrap.appendChild(nameInput);

        var passwordWrap = document.createElement("label");
        passwordWrap.className = "limits-field";
        var passwordCaption = document.createElement("span");
        passwordCaption.textContent = "New password (leave blank to keep current)";
        var passwordInput = document.createElement("input");
        passwordInput.type = "password";
        passwordInput.className = "form-field";
        passwordInput.autocomplete = "new-password";
        passwordInput.minLength = 10;
        passwordInput.placeholder = "At least 10 characters";
        passwordInput.setAttribute("data-edit-field", "password");
        passwordWrap.appendChild(passwordCaption);
        passwordWrap.appendChild(passwordInput);

        var grid = document.createElement("div");
        grid.className = "limits-form-grid";
        grid.appendChild(emailWrap);
        grid.appendChild(nameWrap);
        grid.appendChild(passwordWrap);
        form.appendChild(grid);

        var saveButton = document.createElement("button");
        saveButton.type = "button";
        saveButton.className = "primary-action mt-3 px-4 py-2 text-sm font-semibold";
        saveButton.setAttribute("data-action", "admin-save-user-edit");
        saveButton.setAttribute("data-user-id", user.id);
        saveButton.textContent = "Save details";
        form.appendChild(saveButton);
        return form;
      }

      function toggleUserEditForm(userId) {
        var existing = document.querySelector('[data-edit-user-id="' + userId + '"]');
        if (existing) { existing.remove(); return; }
        var user = state.admin.usersById[userId];
        if (!user) return;
        var row = document.querySelector('[data-user-row-id="' + userId + '"]');
        if (!row) return;
        row.insertAdjacentElement("afterend", buildUserEditForm(user));
      }

      async function saveUserEdit(userId) {
        var form = document.querySelector('[data-edit-user-id="' + userId + '"]');
        if (!form) return;
        var nameInput = form.querySelector('[data-edit-field="displayName"]');
        var passwordInput = form.querySelector('[data-edit-field="password"]');
        var payload = {};
        if (nameInput && nameInput.value.trim()) payload.displayName = nameInput.value.trim();
        var password = passwordInput ? passwordInput.value : "";
        if (password) {
          if (password.length < 10) {
            toast("Password must be at least 10 characters.", "error");
            return;
          }
          payload.password = password;
        }
        if (!Object.keys(payload).length) {
          toast("Nothing to save.", "error");
          return;
        }
        try {
          await adminFetch("/api/admin/users/" + userId, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload)
          });
          toast("Account updated.", "success");
          form.remove();
          await loadAdminUsersPage();
        } catch (error) {
          toast(error.message || "Unable to update account.", "error");
        }
      }

      function toggleUserLimitsForm(userId) {
        var existing = document.querySelector('[data-limits-user-id="' + userId + '"]');
        if (existing) { existing.remove(); return; }
        var user = state.admin.usersById[userId];
        if (!user) return;
        var row = document.querySelector('[data-user-row-id="' + userId + '"]');
        if (!row) return;
        row.insertAdjacentElement("afterend", buildUserLimitsForm(user));
      }

      async function saveUserLimits(userId) {
        var form = document.querySelector('[data-limits-user-id="' + userId + '"]');
        if (!form) return;
        var payload = {};
        LIMITS_FIELDS.forEach(function (field) {
          var key = field[0], type = field[2];
          var inheritBox = form.querySelector('[data-limits-inherit="' + key + '"] input');
          if (inheritBox && inheritBox.checked) return;
          var input = form.querySelector('[data-limits-field="' + key + '"]');
          if (!input) return;
          if (type === "boolean") payload[key] = input.checked;
          else if (input.value !== "") payload[key] = Number(input.value);
        });
        try {
          await adminFetch("/api/admin/users/" + userId, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ customLimits: payload })
          });
          toast("Limits saved.", "success");
          await loadAdminUsersPage();
        } catch (error) {
          toast(error.message || "Unable to save limits.", "error");
        }
      }

      function renderAdminUsersList(users, roles) {
        el.adminUsers.textContent = "";
        if (!users.length) {
          el.adminUsers.textContent = "No accounts match these filters.";
          return;
        }
        users.forEach(function (user) {
          var row = document.createElement("div");
          row.className = "admin-row";
          row.setAttribute("data-user-row-id", user.id);

          var spacer = document.createElement("span");

          var body = document.createElement("div");
          body.className = "admin-row-main";
          var title = document.createElement("span");
          title.className = "admin-row-title";
          title.textContent = user.displayName + " · " + user.email;
          var meta = document.createElement("div");
          meta.className = "admin-row-meta";
          var tierBadge = document.createElement("span");
          tierBadge.className = "tier-badge " + tierBadgeClass(user.rank);
          tierBadge.textContent = tierBadgeIcon(user.rank) + " " + user.roleName;
          meta.appendChild(tierBadge);
          var statusText = document.createElement("span");
          statusText.textContent = (user.status === "active" ? "Active" : "Disabled") +
            (user.lastLoginAt ? " · last login " + formatDate(user.lastLoginAt) : " · never logged in");
          meta.appendChild(statusText);
          body.appendChild(title);
          body.appendChild(meta);

          var controls = document.createElement("div");
          controls.className = "admin-row-actions";

          var roleSelect = document.createElement("select");
          roleSelect.className = "filter-select";
          roles.forEach(function (role) {
            var option = document.createElement("option");
            option.value = String(role.id);
            option.textContent = role.name;
            option.selected = role.id === user.roleId;
            roleSelect.appendChild(option);
          });
          roleSelect.addEventListener("change", function () { changeUserRole(user.id, roleSelect.value); });

          var editButton = document.createElement("button");
          editButton.type = "button";
          editButton.className = "rounded-md border border-[var(--line)] px-3 py-2 text-xs text-slate-300";
          editButton.setAttribute("data-action", "admin-toggle-user-edit");
          editButton.setAttribute("data-user-id", user.id);
          editButton.textContent = "Edit";

          var limitsButton = document.createElement("button");
          limitsButton.type = "button";
          limitsButton.className = "rounded-md border border-[var(--line)] px-3 py-2 text-xs text-slate-300";
          limitsButton.setAttribute("data-action", "admin-toggle-user-limits");
          limitsButton.setAttribute("data-user-id", user.id);
          limitsButton.textContent = "Limits";

          var toggleButton = document.createElement("button");
          toggleButton.type = "button";
          toggleButton.className = "rounded-md border border-[var(--line)] px-3 py-2 text-xs text-slate-300";
          toggleButton.setAttribute("data-action", "admin-toggle-user-status");
          toggleButton.setAttribute("data-user-id", user.id);
          toggleButton.setAttribute("data-user-status", user.status === "active" ? "disabled" : "active");
          toggleButton.textContent = user.status === "active" ? "Disable" : "Enable";

          var deleteButton = document.createElement("button");
          deleteButton.type = "button";
          deleteButton.className = "rounded-md border border-red-500/30 px-3 py-2 text-xs text-red-300";
          deleteButton.setAttribute("data-action", "admin-delete-user");
          deleteButton.setAttribute("data-user-id", user.id);
          deleteButton.textContent = "Delete";

          controls.appendChild(roleSelect);
          controls.appendChild(editButton);
          controls.appendChild(limitsButton);
          controls.appendChild(toggleButton);
          controls.appendChild(deleteButton);

          row.appendChild(spacer);
          row.appendChild(body);
          row.appendChild(controls);
          el.adminUsers.appendChild(row);
        });
      }

      function renderUsersPagination() {
        if (!el.adminUsersPagination) return;
        var u = state.admin.users;
        var totalPages = Math.max(1, Math.ceil(u.total / u.pageSize));
        el.adminUsersPagination.textContent = "";
        var prev = document.createElement("button");
        prev.type = "button";
        prev.textContent = "Previous";
        prev.disabled = u.page <= 1;
        prev.setAttribute("data-action", "admin-users-page-prev");
        var label = document.createElement("span");
        label.textContent = "Page " + u.page + " of " + totalPages + " · " + u.total + " total";
        var next = document.createElement("button");
        next.type = "button";
        next.textContent = "Next";
        next.disabled = u.page >= totalPages;
        next.setAttribute("data-action", "admin-users-page-next");
        el.adminUsersPagination.appendChild(prev);
        el.adminUsersPagination.appendChild(label);
        el.adminUsersPagination.appendChild(next);
      }

      function changeUsersPage(delta) {
        var u = state.admin.users;
        var totalPages = Math.max(1, Math.ceil(u.total / u.pageSize));
        u.page = Math.max(1, Math.min(totalPages, u.page + delta));
        loadAdminUsersPage();
      }

      function renderAdminRoles(roles) {
        el.adminRoles.textContent = "";
        roles.forEach(function (role) {
          var card = document.createElement("div");
          card.className = "rounded-lg border border-[var(--line)] p-4";
          card.setAttribute("data-role-card", String(role.id));

          var nameRow = document.createElement("div");
          nameRow.className = "flex items-center gap-3";
          var nameInput = document.createElement("input");
          nameInput.className = "form-field";
          nameInput.value = role.name;
          nameInput.setAttribute("data-role-field", "name");
          var rankBadge = document.createElement("span");
          rankBadge.className = "note-badge";
          rankBadge.textContent = "rank " + role.rank;
          nameRow.appendChild(nameInput);
          nameRow.appendChild(rankBadge);
          card.appendChild(nameRow);

          if (role.rank === 0) {
            var fixedNote = document.createElement("p");
            fixedNote.className = "mt-2 text-xs text-slate-500";
            fixedNote.textContent = "Admin limits are fixed and not configurable.";
            card.appendChild(fixedNote);
          } else {
            var limits = role.defaultLimits || {};
            var grid = document.createElement("div");
            grid.className = "content-field-grid mt-3";
            [
              ["ttlSeconds", "Note expiry (seconds)"],
              ["maxTextLength", "Max text length"],
              ["maxFileSizeMB", "Max file size (MB)"],
              ["maxBatchTotalMB", "Max batch total (MB)"],
              ["maxFilesPerBatch", "Max files per batch"],
              ["fileTtlSeconds", "File expiry (seconds)"]
            ].forEach(function (pair) {
              var label = document.createElement("label");
              label.className = "grid gap-1 text-xs";
              label.textContent = pair[1];
              var input = document.createElement("input");
              input.className = "form-field mt-1";
              input.type = "number";
              input.min = "1";
              input.value = limits[pair[0]] != null ? limits[pair[0]] : "";
              input.setAttribute("data-role-field", pair[0]);
              label.appendChild(input);
              grid.appendChild(label);
            });
            card.appendChild(grid);
          }

          var saveButton = document.createElement("button");
          saveButton.type = "button";
          saveButton.className = "primary-action mt-3 px-4 py-2 text-sm font-semibold";
          saveButton.setAttribute("data-action", "admin-save-role");
          saveButton.setAttribute("data-role-id", String(role.id));
          saveButton.textContent = "Save role";
          card.appendChild(saveButton);

          el.adminRoles.appendChild(card);
        });
      }

      async function createAdminUser(event) {
        event.preventDefault();
        var email = el.newUserEmail.value.trim();
        var displayName = el.newUserName.value.trim();
        var password = el.newUserPassword.value;
        var roleId = Number(el.newUserRole.value);
        if (!email) return fieldError(el.newUserEmail, "Enter an email address.");
        if (!displayName) return fieldError(el.newUserName, "Enter a display name.");
        if (password.length < 10) return fieldError(el.newUserPassword, "Password must be at least 10 characters.");

        el.adminUserCreateSubmit.disabled = true;
        try {
          await adminFetch("/api/admin/users", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email: email, password: password, displayName: displayName, roleId: roleId })
          });
          el.adminUserCreateForm.reset();
          toast("Account created.", "success");
          await loadAdminUsersPage();
        } catch (error) {
          toast(error.message || "Unable to create account.", "error");
        } finally {
          el.adminUserCreateSubmit.disabled = false;
        }
      }

      /** Client-side-only handoff from an approved account request (Inbox)
       *  into this Create account form -- no new endpoint (V3-PLAN 7.5). */
      function prefillCreateAccountForm(name, email) {
        if (el.newUserName) el.newUserName.value = name || "";
        if (el.newUserEmail) el.newUserEmail.value = email || "";
        if (el.adminUserCreateSection && el.adminUserCreateSection.scrollIntoView) {
          el.adminUserCreateSection.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        if (el.newUserPassword) el.newUserPassword.focus();
      }

      async function changeUserRole(userId, roleId) {
        try {
          await adminFetch("/api/admin/users/" + userId, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ roleId: Number(roleId) })
          });
          toast("Role updated.", "success");
        } catch (error) {
          toast(error.message || "Unable to update role.", "error");
          await loadAdminUsersPage();
        }
      }

      async function toggleUserStatus(userId, nextStatus) {
        try {
          await adminFetch("/api/admin/users/" + userId, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ status: nextStatus })
          });
          toast(nextStatus === "active" ? "Account enabled." : "Account disabled.", "success");
          await loadAdminUsersPage();
        } catch (error) {
          toast(error.message || "Unable to update account.", "error");
        }
      }

      async function deleteAdminUser(userId) {
        try {
          await adminFetch("/api/admin/users/" + userId, { method: "DELETE" });
          toast("Account deleted.", "success");
          await loadAdminUsersPage();
        } catch (error) {
          toast(error.message || "Unable to delete account.", "error");
        }
      }

      async function saveRole(roleId) {
        var role = adminRolesCache.filter(function (entry) { return String(entry.id) === String(roleId); })[0];
        if (!role) return;
        var card = document.querySelector('[data-role-card="' + roleId + '"]');
        if (!card) return;
        var payload = {};
        var nameField = card.querySelector('[data-role-field="name"]');
        if (nameField) payload.name = nameField.value;
        if (role.rank !== 0) {
          var limits = {};
          card.querySelectorAll("[data-role-field]").forEach(function (field) {
            var key = field.getAttribute("data-role-field");
            if (key === "name") return;
            var num = Number(field.value);
            if (Number.isFinite(num)) limits[key] = num;
          });
          payload.defaultLimits = limits;
        }
        try {
          await adminFetch("/api/admin/roles/" + roleId, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload)
          });
          toast("Role saved.", "success");
          await loadAdminUsersPage();
        } catch (error) {
          toast(error.message || "Unable to save role.", "error");
        }
      }

      /** V3-PLAN 3.3: one shared render helper for the tier chip next to a
       *  drop's "shared by" name, used identically on the Nearby text board
       *  and the Nearby files board (Task 3 -- notes.ts/files.ts already
       *  include sharedBy.rank on every public list/open response). Only
       *  Admin (rank 0) also gets the loud .tier-card-admin row treatment;
       *  Pro (1) and Member (2) get the chip only, no card change; no
       *  sharedBy (anonymous) leaves the row exactly as before. */
      function buildSharedByBadge(sharedBy, cardEl) {
        if (!sharedBy || !sharedBy.name) return null;
        var badge = document.createElement("span");
        badge.className = "tier-badge " + tierBadgeClass(sharedBy.rank);
        badge.textContent = tierBadgeIcon(sharedBy.rank) + " " + sharedBy.name;
        if (cardEl && Number(sharedBy.rank) === 0) {
          cardEl.classList.add("tier-card-admin");
        }
        return badge;
      }

      function formatBytes(bytes) {
        var value = Number(bytes) || 0;
        if (value < 1024) return value + " B";
        if (value < 1024 * 1024) return (value / 1024).toFixed(1) + " KB";
        if (value < 1024 * 1024 * 1024) return (value / (1024 * 1024)).toFixed(1) + " MB";
        return (value / (1024 * 1024 * 1024)).toFixed(2) + " GB";
      }

      /* ------------------------------------------------------------ */
      /* Inbox -- GET /api/admin/feedback (feedback + account requests) */
      /* ------------------------------------------------------------ */

      function switchInboxSubtab(tabName) {
        el.adminInboxTabs.forEach(function (tab) {
          var active = tab.getAttribute("data-inbox-tab") === tabName;
          tab.classList.toggle("active", active);
          tab.setAttribute("aria-selected", active ? "true" : "false");
        });
      }

      /** account_request rows are mixed into the same feedback table as bug
       *  reports (see feedback.ts) -- GET /api/admin/feedback filters by a
       *  single category value, so "general feedback" (bug/suggestion/
       *  design/other combined) has no server-side "not account_request"
       *  option. Fetched unfiltered and account_request rows are dropped
       *  client-side for that tab; the Account requests tab passes
       *  category=account_request explicitly and needs no such filtering. */
      async function loadAdminInbox() {
        if (!el.adminInboxList) return;
        el.adminInboxList.textContent = "Loading…";
        try {
          var inbox = state.admin.inbox;
          var isRequests = inbox.tab === "requests";
          var params = new URLSearchParams();
          params.set("page", String(inbox.page));
          params.set("pageSize", String(inbox.pageSize));
          if (inbox.status) params.set("status", inbox.status);
          if (isRequests) params.set("category", "account_request");
          var data = await adminFetch("/api/admin/feedback?" + params.toString());
          var items = data.items || [];
          if (!isRequests) items = items.filter(function (item) { return item.category !== "account_request"; });
          inbox.total = isRequests ? data.total : items.length;
          renderAdminInboxList(items, isRequests);
          renderInboxPagination();
          loadInboxCounts(isRequests);
        } catch (error) {
          el.adminInboxList.textContent = "";
          toast(error.message || "Unable to load the inbox.", "error");
        }
      }

      async function loadInboxCounts(isRequests) {
        if (!el.adminInboxCounts) return;
        try {
          var base = isRequests ? "&category=account_request" : "";
          var statuses = ["new", "reviewed", "resolved"];
          var results = await Promise.all(statuses.map(function (status) {
            return adminFetch("/api/admin/feedback?pageSize=1&status=" + status + base);
          }));
          el.adminInboxCounts.textContent = "";
          statuses.forEach(function (status, index) {
            var chip = document.createElement("span");
            chip.className = "note-badge";
            chip.textContent = status.charAt(0).toUpperCase() + status.slice(1) + ": " + (results[index].total || 0);
            el.adminInboxCounts.appendChild(chip);
          });
        } catch (error) {}
      }

      function renderAdminInboxList(items, isRequests) {
        el.adminInboxList.textContent = "";
        if (!items.length) {
          el.adminInboxList.textContent = isRequests ? "No account requests." : "No feedback submitted yet.";
          return;
        }
        items.forEach(function (item) {
          var row = document.createElement("article");
          row.className = "border-b border-[var(--line)] py-4 first:pt-0 last:border-0 last:pb-0";
          var top = document.createElement("div");
          top.className = "flex flex-wrap items-center justify-between gap-2";
          var label = document.createElement("strong");
          label.textContent = String(item.category || "other") + (item.rating ? " · " + item.rating + "/5" : "");
          var status = document.createElement("span");
          status.className = "note-badge";
          status.textContent = item.status || "new";
          top.appendChild(label);
          top.appendChild(status);
          var message = document.createElement("p");
          message.className = "mt-3 whitespace-pre-wrap text-sm leading-6";
          message.textContent = item.message || "";
          var details = document.createElement("p");
          details.className = "mt-2 text-xs text-slate-500";
          details.textContent = (item.email || "No email") + " · " + formatDate(item.createdAt);
          var actions = document.createElement("div");
          actions.className = "mt-3 flex flex-wrap gap-2";
          if (isRequests) {
            var approve = document.createElement("button");
            approve.type = "button";
            approve.className = "rounded-md border border-[var(--line)] px-3 py-1.5 text-xs font-semibold text-[var(--accent)]";
            approve.setAttribute("data-action", "admin-approve-request");
            approve.setAttribute("data-feedback-id", item.id);
            approve.setAttribute("data-email", item.email || "");
            approve.setAttribute("data-name", (item.message || "").split("\n")[0].slice(0, 80));
            approve.textContent = "Approve →";
            actions.appendChild(approve);
          }
          ["new", "reviewed", "resolved"].forEach(function (nextStatus) {
            var button = document.createElement("button");
            button.type = "button";
            button.className = "rounded-md border border-[var(--line)] px-3 py-1.5 text-xs";
            button.setAttribute("data-action", "admin-feedback-status");
            button.setAttribute("data-feedback-id", item.id);
            button.setAttribute("data-feedback-status", nextStatus);
            button.disabled = item.status === nextStatus;
            button.textContent = nextStatus.charAt(0).toUpperCase() + nextStatus.slice(1);
            actions.appendChild(button);
          });
          var remove = document.createElement("button");
          remove.type = "button";
          remove.className = "rounded-md border border-red-500/30 px-3 py-1.5 text-xs text-red-300";
          remove.setAttribute("data-action", "admin-delete-feedback");
          remove.setAttribute("data-feedback-id", item.id);
          remove.textContent = "Delete";
          actions.appendChild(remove);
          row.appendChild(top);
          row.appendChild(message);
          row.appendChild(details);
          row.appendChild(actions);
          el.adminInboxList.appendChild(row);
        });
      }

      function renderInboxPagination() {
        if (!el.adminInboxPagination) return;
        var i = state.admin.inbox;
        var totalPages = Math.max(1, Math.ceil(i.total / i.pageSize));
        el.adminInboxPagination.textContent = "";
        var prev = document.createElement("button");
        prev.type = "button";
        prev.textContent = "Previous";
        prev.disabled = i.page <= 1;
        prev.setAttribute("data-action", "admin-inbox-page-prev");
        var label = document.createElement("span");
        label.textContent = "Page " + i.page + " of " + totalPages + " · " + i.total + " total";
        var next = document.createElement("button");
        next.type = "button";
        next.textContent = "Next";
        next.disabled = i.page >= totalPages;
        next.setAttribute("data-action", "admin-inbox-page-next");
        el.adminInboxPagination.appendChild(prev);
        el.adminInboxPagination.appendChild(label);
        el.adminInboxPagination.appendChild(next);
      }

      function changeInboxPage(delta) {
        var i = state.admin.inbox;
        var totalPages = Math.max(1, Math.ceil(i.total / i.pageSize));
        i.page = Math.max(1, Math.min(totalPages, i.page + delta));
        loadAdminInbox();
      }

      function approveAccountRequest(name, email) {
        switchAdminTab("users");
        loadAdminTabData("users");
        prefillCreateAccountForm(name, email);
        toast("Prefilled the create-account form -- pick a role and password to finish.", "success");
      }

      /* ------------------------------------------------------------ */
      /* Settings -- unchanged PATCH /api/admin/settings, sub-nav only  */
      /* ------------------------------------------------------------ */

      function switchSettingsSubtab(name) {
        el.adminSettingsSubtabs.forEach(function (tab) {
          var active = tab.getAttribute("data-settings-subtab") === name;
          tab.classList.toggle("active", active);
          tab.setAttribute("aria-selected", active ? "true" : "false");
        });
        el.adminSettingsPanels.forEach(function (panel) {
          panel.classList.toggle("hidden", panel.getAttribute("data-settings-panel") !== name);
        });
      }

      /** Settings has no dedicated GET endpoint of its own -- the only route
       *  that returns the full SiteSettings object is the legacy, untouched
       *  GET /api/admin/dashboard (kept alive server-side for exactly this).
       *  Only its `settings` field is used here; notes/files/feedback/stats/
       *  chart/eventCounts from that payload are ignored in favor of the
       *  Overview/Drops/Users/Inbox tabs' own paginated endpoints. */
      async function loadAdminSettingsTab() {
        try {
          var data = await adminFetch("/api/admin/dashboard");
          fillAdminSettings(data.settings || {});
        } catch (error) {
          toast(error.message || "Unable to load settings.", "error");
        }
      }

      function fillAdminSettings(settings) {
        el.settingAppName.value = settings.appName || "";
        el.settingTagline.value = settings.tagline || "";
        el.settingAnnouncement.value = settings.announcement || "";
        el.settingTtl.value = Math.round(Number(settings.ttlSeconds || 3600) / 60);
        el.settingMaxItems.value = settings.maxLocalItems || 50;
        el.settingTitleLength.value = settings.maxTitleLength || 80;
        el.settingTextLength.value = settings.maxTextLength || 10000;
        el.settingCreateCooldown.value = settings.createCooldownSeconds || 3;
        el.settingUnlockCooldown.value = settings.unlockCooldownSeconds || 2;
        el.settingDefaultTheme.value = settings.defaultTheme || "system";
        el.settingNotesEnabled.checked = Boolean(settings.notesEnabled);
        el.settingPinEnabled.checked = Boolean(settings.pinEnabled);
        el.settingCrossNetwork.checked = Boolean(settings.crossNetworkAddEnabled);
        el.settingFeedbackEnabled.checked = Boolean(settings.feedbackEnabled);
        el.settingAnalyticsEnabled.checked = Boolean(settings.analyticsEnabled);
        el.settingMaintenance.checked = Boolean(settings.maintenanceMode);
        el.settingAnnouncementEnabled.checked = Boolean(settings.announcementEnabled);
        renderAdminContentFields(settings);
      }

      function renderAdminContentFields(settings) {
        // Rebuilt for the V3 settings cut (V3-PLAN.md section 2): every
        // group here now maps 1:1 onto the ~59 surviving DEFAULT_SETTINGS
        // keys (Tier 1 operational + Tier 2 brand/marketing). The ~90
        // deleted micro-copy keys (header/drawer/hero-panel/ticker/guide/
        // feedback labels, section-visibility toggles, files/QR-tool
        // labels) moved to client/copy.js and are no longer admin-editable.
        var groups = [
          ["Announcement", [
            ["announcementLabel", "Announcement badge"]
          ], "general"],
          ["Hero section", [
            ["heroTitlePrimary", "Main title"], ["heroTitleOutline", "Outlined title"],
            ["heroDescription", "Description", "textarea"],
            ["heroPrimaryButtonText", "Primary button"], ["heroSecondaryButtonText", "Secondary button"]
          ], "content"],
          ["About and developer", [
            ["aboutTitle", "About heading"], ["aboutText", "About description", "textarea"],
            ["developerName", "Developer name"], ["developerRole", "Developer role"],
            ["developerBio", "Developer bio", "textarea"],
            ["developerWebsite", "Developer website", "url"], ["developerEmail", "Developer email", "email"]
          ], "content"],
          ["Footer, social and maintenance", [
            ["footerTagline", "Footer tagline"],
            ["socialFacebook", "Facebook URL", "url"], ["socialInstagram", "Instagram URL", "url"],
            ["socialX", "X URL", "url"], ["socialLinkedIn", "LinkedIn URL", "url"],
            ["socialGitHub", "GitHub URL", "url"], ["socialYouTube", "YouTube URL", "url"],
            ["maintenanceTitle", "Maintenance title"], ["maintenanceMessage", "Maintenance message", "textarea"]
          ], "content"],
          ["File sharing limits", [
            ["fileSharingEnabled", "Enable file sharing", "checkbox"],
            ["maxFileSizeMB", "Max file size (MB)", "number", 1, 200],
            ["maxTotalStorageMB", "Total storage cap (MB)", "number", 50, 20000],
            ["fileTtlSeconds", "File retention (seconds)", "number", 300, 604800],
            ["fileUploadCooldownSeconds", "Upload cooldown (seconds)", "number", 1, 120],
            ["maxActiveFiles", "Max active files per network", "number", 10, 2000],
            ["allowedFileExtensions", "Allowed extensions (comma-separated, blank = all)"],
            ["blockedFileExtensions", "Blocked extensions (comma-separated)"]
          ], "limits"],
          ["Network visibility", [
            ["networkVisibilityTtlSeconds", "Nearby board visibility (seconds)", "number", 600, 172800]
          ], "limits"],
          ["QR link generator", [
            ["qrLinkToolEnabled", "Enable standalone QR tool", "checkbox"]
          ], "limits"],
          ["SEO", [
            ["seoEnabled", "Enable SEO tags", "checkbox"],
            ["seoSiteTitle", "Site title (<title> tag)"],
            ["seoMetaDescription", "Meta description", "textarea"],
            ["seoKeywords", "Keywords (comma-separated)", "textarea"],
            ["seoOgImageUrl", "Social share image URL", "url"],
            ["seoTwitterHandle", "Twitter/X handle"],
            ["seoCanonicalBaseUrl", "Canonical base URL (blank = auto-detect)", "url"],
            ["seoGoogleSiteVerification", "Google site verification code"],
            ["seoRobotsDirective", "Robots directive", "select", ["index, follow", "noindex, follow", "index, nofollow", "noindex, nofollow"]]
          ], "seo"]
        ];
        var targets = {
          general: el.adminContentFieldsGeneral,
          limits: el.adminContentFieldsLimits,
          content: el.adminContentFieldsContent,
          seo: el.adminContentFieldsSeo
        };
        Object.keys(targets).forEach(function (key) { if (targets[key]) targets[key].textContent = ""; });
        groups.forEach(function (group) {
          var container = targets[group[2]];
          if (!container) return;
          var section = document.createElement("section");
          section.className = "content-field-group";
          var heading = document.createElement("h3");
          heading.className = "font-bold text-white";
          heading.textContent = group[0];
          var grid = document.createElement("div");
          grid.className = "content-field-grid";
          group[1].forEach(function (field) {
            var key = field[0], caption = field[1], type = field[2] || "text";
            var label = document.createElement("label");
            var input;
            if (type === "textarea") {
              input = document.createElement("textarea");
              input.rows = 3;
              input.maxLength = 1000;
              input.value = settings[key] == null ? "" : String(settings[key]);
              label.className = "grid gap-2 text-sm";
            } else if (type === "checkbox") {
              input = document.createElement("input");
              input.type = "checkbox";
              input.checked = Boolean(settings[key]);
              label.className = "setting-toggle";
            } else if (type === "number") {
              input = document.createElement("input");
              input.type = "number";
              if (field[3] != null) input.min = field[3];
              if (field[4] != null) input.max = field[4];
              input.value = settings[key] == null ? "" : String(settings[key]);
              input.className = "form-field";
              label.className = "grid gap-2 text-sm";
            } else if (type === "select") {
              input = document.createElement("select");
              (field[3] || []).forEach(function (optionValue) {
                var option = document.createElement("option");
                option.value = optionValue;
                option.textContent = optionValue;
                if (settings[key] === optionValue) option.selected = true;
                input.appendChild(option);
              });
              input.className = "form-field";
              label.className = "grid gap-2 text-sm";
            } else {
              input = document.createElement("input");
              input.type = type === "url" || type === "email" ? type : "text";
              input.maxLength = type === "url" ? 500 : 200;
              input.value = settings[key] == null ? "" : String(settings[key]);
              input.className = "form-field";
              label.className = "grid gap-2 text-sm";
            }
            input.setAttribute("data-setting-key", key);
            var captionNode = document.createElement("span");
            captionNode.textContent = caption;
            if (type === "checkbox") {
              label.appendChild(captionNode);
              label.appendChild(input);
            } else {
              label.appendChild(captionNode);
              label.appendChild(input);
            }
            grid.appendChild(label);
          });
          section.appendChild(heading);
          section.appendChild(grid);
          container.appendChild(section);
        });
      }

      async function saveAdminSettings(event) {
        event.preventDefault();
        el.adminSettingsSubmit.disabled = true;
        el.adminSettingsSubmit.textContent = "Saving…";
        try {
          var payload = {
            appName: el.settingAppName.value.trim(),
            tagline: el.settingTagline.value.trim(),
            announcement: el.settingAnnouncement.value.trim(),
            ttlSeconds: Number(el.settingTtl.value) * 60,
            maxLocalItems: Number(el.settingMaxItems.value),
            maxTitleLength: Number(el.settingTitleLength.value),
            maxTextLength: Number(el.settingTextLength.value),
            createCooldownSeconds: Number(el.settingCreateCooldown.value),
            unlockCooldownSeconds: Number(el.settingUnlockCooldown.value),
            defaultTheme: el.settingDefaultTheme.value,
            notesEnabled: el.settingNotesEnabled.checked,
            pinEnabled: el.settingPinEnabled.checked,
            crossNetworkAddEnabled: el.settingCrossNetwork.checked,
            feedbackEnabled: el.settingFeedbackEnabled.checked,
            analyticsEnabled: el.settingAnalyticsEnabled.checked,
            maintenanceMode: el.settingMaintenance.checked,
            announcementEnabled: el.settingAnnouncementEnabled.checked
          };
          el.adminSettingsForm.querySelectorAll("[data-setting-key]").forEach(function (input) {
            var key = input.getAttribute("data-setting-key");
            if (input.type === "checkbox") {
              payload[key] = input.checked;
            } else if (input.type === "number") {
              payload[key] = Number(input.value);
            } else {
              payload[key] = input.value.trim();
            }
          });
          await adminFetch("/api/admin/settings", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload)
          });
          toast("Settings saved. Public pages will use them immediately.", "success");
          await loadAdminSettingsTab();
        } catch (error) {
          toast(error.message || "Unable to save settings.", "error");
        } finally {
          el.adminSettingsSubmit.disabled = false;
          el.adminSettingsSubmit.textContent = "Save settings";
        }
      }

      async function updateFeedbackStatus(feedbackId, status) {
        try {
          await adminFetch("/api/admin/feedback/" + encodeURIComponent(feedbackId), {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ status: status })
          });
          await loadAdminInbox();
        } catch (error) {
          toast(error.message || "Unable to update feedback.", "error");
        }
      }

      async function deleteFeedback(feedbackId) {
        if (!window.confirm("Delete this feedback submission?")) return;
        try {
          await adminFetch("/api/admin/feedback/" + encodeURIComponent(feedbackId), { method: "DELETE" });
          toast("Feedback deleted.", "success");
          await loadAdminInbox();
        } catch (error) {
          toast(error.message || "Unable to delete feedback.", "error");
        }
      }

      function adminFetch(url, options) {
        var config = Object.assign({}, options || {});
        config.headers = Object.assign({}, (options && options.headers) || {}, { "x-airtext-admin": "1" });
        return apiFetch(url, config);
      }

      async function apiFetch(url, options) {
        if (options && options.body instanceof FormData) return uploadRequest(url, options);
        var response;
        try {
          var config = Object.assign({}, options || {});
          config.headers = Object.assign({ "accept": "application/json" }, (options && options.headers) || {});
          var encryptedCode = url.match(/^\/api\/share\/([A-Za-z0-9]{4,12})(?:[/?]|$)/);
          if (encryptedCode && keyForCode(encryptedCode[1])) config.headers["x-airtext-decrypt-ready"] = "1";
          response = await fetch(url, config);
        } catch (error) {
          throw new Error("Network error. Check your connection and try again.");
        }

        var data = null;
        try { data = await response.json(); } catch (error) {}

        if (!response.ok || !data || data.ok === false) {
          var message = data && data.error ? data.error : "Request failed with status " + response.status + ".";
          var requestError = new Error(message);
          requestError.status = response.status;
          requestError.code = data && data.code;
          throw requestError;
        }

        return data;
      }

      function startPolling() {
        if (state.pollingTimer) window.clearInterval(state.pollingTimer);
        state.pollingTimer = window.setInterval(function () {
          if (document.visibilityState === "visible") {
            if (el.boardList) loadLocalItems(false);
            if (el.filesBoardList) loadLocalFiles(false);
          }
        }, 10000);
      }

      function updateCountdowns() {
        document.querySelectorAll("[data-expires]").forEach(function (node) {
          var expiresAt = Number(node.getAttribute("data-expires"));
          if (!expiresAt) return;
          node.textContent = formatRemaining(expiresAt);
        });

        var before = state.items.length;
        state.items = state.items.filter(function (item) { return Number(item.expiresAt) > Date.now(); });
        if (state.items.length !== before) renderLocalItems();

        var filesBefore = state.files.length;
        state.files = state.files.filter(function (item) { return Number(item.expiresAt) > Date.now(); });
        if (filesBefore !== state.files.length) renderFilesBoard();
        if (before !== state.items.length || filesBefore !== state.files.length) renderNearby();
        updateBoardClock();
      }

      function updateActiveCountBadge() {
        if (!el.mainTabAvailableCount) return;
        var total = state.items.length + state.files.length;
        el.mainTabAvailableCount.textContent = String(total);
        el.mainTabAvailableCount.classList.toggle("hidden", total === 0);
      }

      function updateBoardClock() {
        if (!el.boardClock) return;
        var soonest = null;
        state.items.concat(state.files).forEach(function (entry) {
          var expiresAt = Number(entry.expiresAt);
          if (expiresAt && (soonest === null || expiresAt < soonest)) soonest = expiresAt;
        });
        if (soonest === null) {
          el.boardClock.classList.add("hidden");
          return;
        }
        var seconds = Math.max(0, Math.ceil((soonest - Date.now()) / 1000));
        el.boardClock.classList.remove("hidden");
        el.boardClock.textContent = seconds <= 0
          ? "Board clears now"
          : "Board clears in " + formatBoardDuration(seconds);
      }

      function formatBoardDuration(seconds) {
        var hours = Math.floor(seconds / 3600);
        var minutes = Math.floor((seconds % 3600) / 60);
        var remainder = seconds % 60;
        if (hours >= 1) return hours + "h " + minutes + "m";
        if (minutes >= 1) return minutes + "m " + remainder + "s";
        return remainder + "s";
      }

      function formatRemaining(expiresAt) {
        var seconds = Math.max(0, Math.ceil((Number(expiresAt) - Date.now()) / 1000));
        if (seconds <= 0) return "Expired";
        var days = Math.floor(seconds / 86400);
        if (days >= 1) return "Expires in " + days + "d " + Math.floor((seconds % 86400) / 3600) + "h";
        var hours = Math.floor(seconds / 3600);
        if (hours >= 1) return "Expires in " + hours + "h " + Math.floor((seconds % 3600) / 60) + "m";
        var minutes = Math.floor(seconds / 60);
        var remainder = seconds % 60;
        if (minutes >= 1) return "Expires in " + minutes + "m " + remainder + "s";
        return "Expires in " + remainder + "s";
      }

      function formatDuration(seconds) {
        var value = Math.max(1, Number(seconds || 0));
        if (value % 86400 === 0) return (value / 86400) + (value === 86400 ? " day" : " days");
        if (value % 3600 === 0) return (value / 3600) + (value === 3600 ? " hour" : " hours");
        if (value % 60 === 0) return (value / 60) + (value === 60 ? " minute" : " minutes");
        return value + " seconds";
      }

      function formatDate(value) {
        var date = new Date(Number(value || 0));
        return Number.isNaN(date.getTime()) ? "Unknown date" : date.toLocaleString();
      }

      function debounce(fn, wait) {
        var timer = null;
        return function () {
          var args = arguments;
          var self = this;
          window.clearTimeout(timer);
          timer = window.setTimeout(function () { fn.apply(self, args); }, wait);
        };
      }

      function updateCounters() {
        if (el.titleCounter && el.shareTitle) {
          el.titleCounter.textContent = el.shareTitle.value.length + " / " + APP.maxTitleLength;
        }
        if (el.textCounter && el.shareText) {
          el.textCounter.textContent = el.shareText.value.length.toLocaleString() + " / " + APP.maxTextLength.toLocaleString();
        }
      }

      function resetCreateForm() {
        el.createForm.reset();
        el.pinFieldWrap.classList.add("hidden");
        el.sharePin.type = "password";
        updateCounters();
      }

      function upsertLocalItem(item, optimistic) {
        state.items = state.items.filter(function (entry) { return entry.id !== item.id; });
        state.items.unshift(item);
        if (optimistic) {
          state.optimisticItems[item.id] = { item: item, addedAt: Date.now() };
        }
      }

      function reconcileLocalItems(remoteItems) {
        var now = Date.now();
        var merged = [];
        var seen = Object.create(null);

        remoteItems.forEach(function (item) {
          if (!item || !item.id || Number(item.expiresAt) <= now || seen[item.id]) return;
          if (!item.source) item.source = getDeleteToken(item.id) ? "mine" : "received";
          if (!item.addedAt) item.addedAt = item.createdAt;
          seen[item.id] = true;
          merged.push(item);
          if (state.optimisticItems[item.id]) delete state.optimisticItems[item.id];
        });

        Object.keys(state.optimisticItems).forEach(function (itemId) {
          var pending = state.optimisticItems[itemId];
          if (!pending || !pending.item || Number(pending.item.expiresAt) <= now) {
            delete state.optimisticItems[itemId];
            return;
          }
          if (!seen[itemId]) {
            seen[itemId] = true;
            merged.push(pending.item);
          }
        });

        merged.sort(function (a, b) { return Number(b.addedAt || b.createdAt) - Number(a.addedAt || a.createdAt); });
        return merged.slice(0, APP.maxLocalItems || 50);
      }

      function renderLinkedText(container, value) {
        var text = String(value || "");
        var linkPattern = /(?:https?|ftp):\/\/[^\s<>"']+|\/\/[^\s<>"']+|www\.[^\s<>"']+|mailto:[^\s<>"']+|(?:tel|sms):\+?[0-9][0-9(). -]{5,}?[0-9](?=\s+(?:[a-z]|(?:\d{1,3}\.){3}\d)|[.,!?;:]?(?:\s|$))|[a-z0-9.!#$%&'*+/=?^_{|}~-]+@(?:[a-z0-9-]+\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})|(?:localhost|(?:\d{1,3}\.){3}\d{1,3})(?::\d{1,5})?(?:[/?#][^\s<>"']*)?|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})(?::\d{1,5})?(?:[/?#][^\s<>"']*)?/gi;
        var lastIndex = 0;
        var match;

        container.textContent = "";
        while ((match = linkPattern.exec(text)) !== null) {
          if (match.index > lastIndex) {
            container.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
          }

          var rawUrl = match[0];
          var trimmed = trimLinkPunctuation(rawUrl);
          rawUrl = trimmed.url;

          var safeHref = toSafeLinkHref(rawUrl);
          if (rawUrl && safeHref) {
            var link = document.createElement("a");
            link.href = safeHref;
            link.target = "_blank";
            link.rel = "noopener noreferrer nofollow";
            link.textContent = rawUrl;
            link.title = "Open link in a new tab";
            container.appendChild(link);
          } else if (rawUrl) {
            container.appendChild(document.createTextNode(rawUrl));
          }
          if (trimmed.trailing) {
            container.appendChild(document.createTextNode(trimmed.trailing));
          }
          lastIndex = match.index + match[0].length;
        }

        if (lastIndex < text.length) {
          container.appendChild(document.createTextNode(text.slice(lastIndex)));
        }
      }

      function trimLinkPunctuation(value) {
        var url = String(value || "");
        var trailing = "";
        var pairs = { ")": "(", "]": "[", "}": "{" };

        while (/[.,!?;:]$/.test(url)) {
          trailing = url.slice(-1) + trailing;
          url = url.slice(0, -1);
        }

        while (/[)\]}]$/.test(url)) {
          var closer = url.slice(-1);
          var opener = pairs[closer];
          var openCount = url.split(opener).length - 1;
          var closeCount = url.split(closer).length - 1;
          if (closeCount <= openCount) break;
          trailing = closer + trailing;
          url = url.slice(0, -1);
        }

        return { url: url, trailing: trailing };
      }

      function toSafeLinkHref(value) {
        var raw = String(value || "").trim();
        if (!raw) return "";

        if (/^mailto:/i.test(raw)) {
          return isEmailAddress(raw.slice(7)) ? raw : "";
        }
        if (/^tel:/i.test(raw)) {
          return /^tel:\+?[0-9][0-9(). -]{5,}[0-9]$/i.test(raw) ? raw : "";
        }
        if (/^sms:/i.test(raw)) {
          return /^sms:\+?[0-9][0-9(). -]{5,}[0-9]$/i.test(raw) ? raw : "";
        }
        if (isEmailAddress(raw)) return "mailto:" + raw;

        var href = raw;
        if (/^\/\//.test(raw)) {
          href = (window.location.protocol === "http:" ? "http:" : "https:") + raw;
        } else if (/^www\./i.test(raw)) {
          href = "https://" + raw;
        } else if (/^(?:localhost|(?:\d{1,3}\.){3}\d{1,3})(?::\d{1,5})?(?:[/?#]|$)/i.test(raw)) {
          href = "http://" + raw;
        } else if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
          href = "https://" + raw;
        }

        try {
          var parsed = new URL(href);
          if (!/^(?:https?:|ftp:)$/i.test(parsed.protocol)) return "";
          if (!parsed.hostname) return "";

          if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(parsed.hostname)) {
            var parts = parsed.hostname.split(".");
            if (parts.some(function (part) { return Number(part) > 255; })) return "";
          }
          return parsed.href;
        } catch (error) {
          return "";
        }
      }

      function isEmailAddress(value) {
        return /^[a-z0-9.!#$%&'*+/=?^_{|}~-]+@(?:[a-z0-9-]+\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/i.test(String(value || ""));
      }

      function normalizeCode(value) {
        return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
      }

      var SECTION_TO_TAB = {
        "create-card": "share",
        "notes-section": "available",
        "join-card": "open-code",
        "files-card": "files"
      };
      var MAIN_TAB_NAMES = ["share", "available", "open-code", "files"];

      function switchTab(name) {
        if (MAIN_TAB_NAMES.indexOf(name) === -1) name = "share";
        el.tabPanels.forEach(function (panel) {
          panel.classList.toggle("tab-hidden", panel.getAttribute("data-tab-panel") !== name);
        });
        el.mainTabs.forEach(function (tab) {
          var active = tab.getAttribute("data-tab") === name;
          tab.classList.toggle("active", active);
          tab.setAttribute("aria-current", active ? "true" : "false");
        });
      }

      function focusSection(sectionId, inputId) {
        var tab = SECTION_TO_TAB[sectionId];
        if (tab) switchTab(tab);
        var section = document.getElementById(sectionId);
        var input = document.getElementById(inputId);
        if (section) {
          window.setTimeout(function () {
            section.scrollIntoView({ behavior: "smooth", block: "center" });
          }, tab ? 30 : 0);
        }
        if (input) window.setTimeout(function () { input.focus(); }, 500);
      }

      function fieldError(field, message) {
        toast(message, "error");
        field.focus();
        field.classList.add("border-red-500/70", "ring-2", "ring-red-500/10");
        window.setTimeout(function () {
          field.classList.remove("border-red-500/70", "ring-2", "ring-red-500/10");
        }, 1800);
      }

      function setButtonLoading(button, loading, label) {
        button.disabled = loading;
        var labelNode = button.querySelector("[data-button-label]");
        var icon = button.querySelector("[data-button-icon]");
        if (labelNode) labelNode.textContent = label;
        if (icon) icon.classList.toggle("animate-pulse", loading);
      }

      function togglePassword(input) {
        input.type = input.type === "password" ? "text" : "password";
        input.focus();
      }

      async function copyText(value, successMessage) {
        if (typeof value === "string" && value.startsWith(window.location.origin + "/s/")) value = withKey(value);
        if (!value) return toast("Nothing to copy.", "error");
        try {
          await navigator.clipboard.writeText(String(value));
          toast(successMessage || "Copied.", "success");
        } catch (error) {
          var temp = document.createElement("textarea");
          temp.value = String(value);
          temp.style.position = "fixed";
          temp.style.opacity = "0";
          document.body.appendChild(temp);
          temp.select();
          document.execCommand("copy");
          temp.remove();
          toast(successMessage || "Copied.", "success");
        }
      }

      function toast(message, type) {
        var container = document.getElementById("toast-container");
        var item = document.createElement("div");
        var isError = type === "error";
        item.className = "toast-enter pointer-events-auto flex items-start gap-3 rounded-md border p-3 shadow-2xl " + (isError
          ? "border-red-500/25 bg-[#2a1b1b] text-red-100"
          : "border-violet-500/25 bg-[var(--panel)] text-violet-100");

        var dot = document.createElement("span");
        dot.className = "mt-1 h-2.5 w-2.5 shrink-0 rounded-full " + (isError ? "bg-red-400" : "bg-violet-400");
        var text = document.createElement("p");
        text.className = "flex-1 text-sm leading-6";
        text.textContent = message;
        var close = document.createElement("button");
        close.type = "button";
        close.className = "text-current opacity-50 transition hover:opacity-100";
        close.textContent = "×";
        close.addEventListener("click", function () { item.remove(); });

        item.appendChild(dot);
        item.appendChild(text);
        item.appendChild(close);
        container.appendChild(item);
        window.setTimeout(function () { item.remove(); }, 4500);
      }


      function ensureEncryptionKey(code) {
        if (keyForCode(code)) return;
        var value = window.prompt("Paste the original encrypted share link or its key. The service cannot recover a lost key.");
        if (!value) throw new Error("The original encrypted link is required. This drop has not been consumed.");
        if (/^https?:\/\//i.test(value)) rememberLinkKey(value); else storeKey(code, value.trim());
        if (!keyForCode(code)) throw new Error("That link has no key for this drop.");
      }
      function ownsDrop(kind, id) { return Boolean(getDeleteToken((kind === "file" ? "file:" : "") + id)); }
      function recentActions() {
        return {
          owns: ownsDrop,
          open: openOwnedDrop,
          copy: function (item) { copyText(dropLink(item), "Share link copied."); },
          qr: function (item) { showQr(item.code, dropLink(item)); },
          edit: function (kind, id) { if (kind === "file") openEditFileModal(id, "anonymous"); else openEditItemModal(id, "anonymous"); },
          remove: async function (item) {
            if (!window.confirm("Delete this drop now?")) return;
            try {
              await apiFetch("/api/" + (item.kind === "file" ? "file/" : "item/") + item.id, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ deleteToken: getDeleteToken((item.kind === "file" ? "file:" : "") + item.id) }) });
              removeDeleteToken((item.kind === "file" ? "file:" : "") + item.id); refreshRecentDrops(); loadLocalItems(false); loadLocalFiles(false);
            } catch (error) { toast(error.message, "error"); }
          }
        };
      }
      function dropLink(item) { return withKey(window.location.origin + (item.kind === "file" ? "/f/" : "/s/") + item.code); }
      function refreshRecentDrops() { renderRecentDrops(recentActions()); }
      async function openOwnedDrop(kind, id) {
        try {
          var token = getDeleteToken((kind === "file" ? "file:" : "") + id);
          var data = await apiFetch("/api/" + (kind === "file" ? "file/" : "item/") + encodeURIComponent(id), { headers: token ? { "x-airtext-owner": token } : {} });
          if (kind === "file") { openFileModal(); showFileResponse(data.group, "owner", data.group.code); }
          else { openItemModal(); showItemResponse(data.item, "owner", data.item.code); }
        } catch (error) { if (error.status === 404) { forgetDrop(id); refreshRecentDrops(); } toast(error.message, "error"); }
      }
      function renderNearby() {
        renderNearbyBoard(state.items, state.files, {
          owns: ownsDrop, remaining: formatRemaining,
          openNearby: function (kind,id) { if (kind === "file") openLocalFile(id); else openLocalItem(id); },
          copyNearby: async function (id) { try { var data = await apiFetch("/api/local/item/" + id); copyText(data.item.text, "Text copied."); } catch (error) {toast(error.message, "error");} },
          qr: function (item) { showQr(item.code, dropLink(item)); }
        });
      }
      function receiveValue(value) {
        var text = String(value || "").trim();
        if (/^https?:\/\//i.test(text)) {
          var parsed = extractCodeFromScan(text);
          if (!parsed.code || parsed.kind === "unknown") return toast("Paste an AirText share link.", "error");
          el.joinCode.value = parsed.code;
          if (parsed.kind === "file") openFileShareByCode(parsed.code, true, "link"); else openShareByCode(parsed.code, true, "link");
          return;
        }
        if (!/^[A-Za-z0-9]{4,12}$/.test(text)) return toast("Enter a code of 4–12 letters or numbers.", "error");
        openAnyShareByCode(text, true, "code");
      }
      async function hydrateLegacyDropHistory() {
        try {
          if (localStorage.getItem("airtext_history_v31")) return;
          var known = new Set(recentDrops().map(function (item) { return item.id; }));
          var tokens = Object.entries(ownerTokenMap()).slice(-50);
          for (var entry of tokens) {
            var kind = entry[0].startsWith("file:") ? "file" : "note";
            var id = entry[0].replace(/^file:/, "");
            if (known.has(id)) continue;
            try {
              var data = await apiFetch("/api/" + (kind === "file" ? "file/" : "item/") + encodeURIComponent(id), {headers:{"x-airtext-owner":entry[1]}});
              rememberDrop(kind, kind === "file" ? data.group : data.item);
            } catch (error) { if (error.status === 404) removeDeleteToken(entry[0]); }
          }
          localStorage.setItem("airtext_history_v31","1"); refreshRecentDrops();
        } catch { /* Storage restrictions do not affect sharing. */ }
      }
      function initDropFeatures() {
        refreshRecentDrops();
        void hydrateLegacyDropHistory();
        var encryptionOption = document.getElementById("encryption-option");
        if (encryptionOption) encryptionOption.hidden = !APP.allowClientEncryption;
        var search = document.getElementById("nearby-search");
        if (search) search.addEventListener("input", renderNearby);
        document.querySelectorAll("[data-nearby-filter]").forEach(function (button) {
          button.addEventListener("click", function () {
            document.querySelectorAll("[data-nearby-filter]").forEach(function (entry) { entry.setAttribute("aria-pressed", String(entry === button)); });
            renderNearby();
          });
        });
        var paste = document.getElementById("receive-paste");
        if (paste) paste.addEventListener("click", async function () { try { receiveValue(await navigator.clipboard.readText()); } catch { toast("Paste into the code field using your keyboard.", "error"); el.joinCode.focus(); } });
        window.addEventListener("storage", refreshRecentDrops);
      }

      function ownerTokenMap() {
        try {
          var parsed = JSON.parse(localStorage.getItem("airtext_owner_tokens") || "{}");
          return parsed && typeof parsed === "object" ? parsed : {};
        } catch (error) {
          return {};
        }
      }

      function saveDeleteToken(itemId, token) {
        var map = ownerTokenMap();
        map[itemId] = token;
        localStorage.setItem("airtext_owner_tokens", JSON.stringify(map));
      }

      function getDeleteToken(itemId) {
        return ownerTokenMap()[itemId] || "";
      }

      function removeDeleteToken(itemId) {
        var map = ownerTokenMap();
        delete map[itemId];
        forgetDrop(itemId.replace(/^file:/, ""));
        refreshRecentDrops();
        localStorage.setItem("airtext_owner_tokens", JSON.stringify(map));
      }

      function lockBodyScroll() {
        document.documentElement.classList.add("overflow-hidden");
      }

      function unlockBodyScrollIfClear() {
        var anyOpen = [el.itemModal, el.fileModal, el.editItemModal, el.editFileModal, el.qrModal, el.scannerModal].some(function (modal) {
          return !modal.classList.contains("hidden");
        });
        if (el.drawer && el.drawer.classList.contains("open")) anyOpen = true;
        if (!anyOpen) document.documentElement.classList.remove("overflow-hidden");
      }

      /* --- V3-PLAN.md section 9 quick-win UX (Phase 7 remainder) --- */

      // Landing-page quick-share card: a compact Text|Files toggle scoped to
      // the hero card only -- deliberately separate from the old sitewide
      // switchTab()/MAIN_TAB_NAMES system (which the new routed pages no
      // longer use) so this can't interfere with any other page.
      function activateQuickShareTab(name) {
        var buttons = document.querySelectorAll('[data-action="quick-share-tab"]');
        if (!buttons.length) return;
        buttons.forEach(function (button) {
          var active = button.getAttribute("data-quick-tab") === name;
          button.classList.toggle("active", active);
          button.setAttribute("aria-current", active ? "true" : "false");
        });
        document.querySelectorAll("[data-quick-tab-panel]").forEach(function (panel) {
          panel.classList.toggle("hidden", panel.getAttribute("data-quick-tab-panel") !== name);
        });
      }

      function activateHowItWorksTab(name) {
        document.querySelectorAll('[data-action="how-it-works-tab"]').forEach(function (button) {
          var active = button.getAttribute("data-how-tab") === name;
          button.classList.toggle("active", active);
          button.setAttribute("aria-current", active ? "true" : "false");
        });
        document.querySelectorAll("[data-how-tab-panel]").forEach(function (panel) {
          panel.classList.toggle("hidden", panel.getAttribute("data-how-tab-panel") !== name);
        });
      }

      // Live "N drops active on your Wi-Fi" strip -- GET /api/local/count
      // already exists server-side (src/routes/notes.ts); only rendered
      // when #wifi-live-count is present on the current page (home only).
      function startWifiLiveCount() {
        if (!el.wifiLiveCount) return;
        fetchWifiLiveCount();
        window.setInterval(fetchWifiLiveCount, 20000);
      }

      async function fetchWifiLiveCount() {
        if (!el.wifiLiveCount) return;
        try {
          var response = await apiFetch("/api/local/count");
          el.wifiLiveCount.textContent = String(response.count || 0);
        } catch (error) {
          // Silent -- a stale/absent count on a marketing strip isn't worth a toast.
        }
      }

      // Expiry chooser (10 min / 1 hour / 1 day / default), clamped
      // client-side to the viewer's effective ttlSeconds/fileTtlSeconds
      // (already in boot data) -- options longer than the viewer's own
      // limit are disabled since the server would clamp them anyway.
      function populateExpiryChoosers() {
        setExpiryOptionsLimit(el.createTtlSelect, APP.ttlSeconds);
        setExpiryOptionsLimit(el.fileTtlSelect, APP.fileTtlSeconds || APP.ttlSeconds);
      }

      function setExpiryOptionsLimit(select, limitSeconds) {
        if (!select) return;
        Array.prototype.forEach.call(select.options, function (option) {
          var value = Number(option.value);
          if (value && limitSeconds && value > limitSeconds) {
            option.disabled = true;
          }
        });
      }

      // Paste-anywhere: pasting outside a form field prefills + focuses the
      // create-text form on whichever page has one (home's quick-share
      // Text tab, or the standalone /text page).
      function bindPasteAnywhere() {
        document.addEventListener("paste", function (event) {
          var active = document.activeElement;
          var isFormField = active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable);
          if (isFormField) return;
          if (!el.createForm || !el.shareText) return;
          var text = event.clipboardData ? event.clipboardData.getData("text/plain") : "";
          if (!text) return;
          event.preventDefault();
          activateQuickShareTab("text");
          el.shareText.value = text;
          updateCounters();
          window.setTimeout(function () {
            el.shareText.focus();
            el.shareText.scrollIntoView({ behavior: "smooth", block: "center" });
          }, 30);
          toast("Pasted into the note.", "success");
        });
      }

      // Drag-anywhere-to-upload: a file dropped anywhere on a page that has
      // the upload form (home's quick-share Files tab, or /files) is routed
      // into the same staged-files flow the drop zone itself uses.
      function bindDragAnywhere() {
        document.addEventListener("dragover", function (event) {
          if (!el.fileInput) return;
          event.preventDefault();
        });
        document.addEventListener("drop", function (event) {
          if (!el.fileInput) return;
          var dropped = event.dataTransfer && event.dataTransfer.files;
          if (!dropped || !dropped.length) return;
          event.preventDefault();
          activateQuickShareTab("files");
          el.fileInput.files = dropped;
          renderStagedFiles();
        });
      }

      // Web Share sheet on the post-create success/QR modal -- feature
      // detected once; the button stays in the DOM (SHARED_MODALS) hidden
      // by default and is only revealed where navigator.share exists.
      function syncWebShareButtonVisibility() {
        if (!el.webShareButton) return;
        el.webShareButton.classList.toggle("hidden", typeof navigator.share !== "function");
      }

      function doWebShare() {
        if (typeof navigator.share !== "function") return;
        var url = el.qrLinkInput ? el.qrLinkInput.value : "";
        var code = state.qrCode || "";
        navigator.share({ title: "AirText share" + (code ? " " + code : ""), url: url }).catch(function () {});
      }
    })();
