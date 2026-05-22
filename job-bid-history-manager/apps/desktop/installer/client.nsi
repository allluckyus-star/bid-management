; Job Bid History Manager — teammate client (gateway + www only)
!include "MUI2.nsh"

!define PRODUCT_NAME "Job Bid History Manager (Client)"
!define PRODUCT_VERSION "0.1.0"
!define INSTALL_DIR "$LOCALAPPDATA\Job Bid History Manager (Client)"
!define BUNDLE_DIR "..\client-bundle"

Name "${PRODUCT_NAME}"
OutFile "${BUNDLE_DIR}\Job Bid History Manager (Client)_${PRODUCT_VERSION}_x64-setup.exe"
InstallDir "${INSTALL_DIR}"
RequestExecutionLevel user
Unicode true

!define MUI_ABORTWARNING
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_LANGUAGE "English"

Section "Install" SecInstall
  SetOutPath "$INSTDIR"
  File "${BUNDLE_DIR}\jbhm-gateway.exe"
  SetOutPath "$INSTDIR\www"
  File /r "${BUNDLE_DIR}\www\*.*"

  CreateDirectory "$SMPROGRAMS\${PRODUCT_NAME}"
  CreateShortcut "$SMPROGRAMS\${PRODUCT_NAME}\${PRODUCT_NAME}.lnk" "$INSTDIR\jbhm-gateway.exe" "" "$INSTDIR\jbhm-gateway.exe" 0
  CreateShortcut "$DESKTOP\${PRODUCT_NAME}.lnk" "$INSTDIR\jbhm-gateway.exe" "" "$INSTDIR\jbhm-gateway.exe" 0
SectionEnd

Section "Uninstall"
  Delete "$INSTDIR\jbhm-gateway.exe"
  RMDir /r "$INSTDIR\www"
  Delete "$SMPROGRAMS\${PRODUCT_NAME}\${PRODUCT_NAME}.lnk"
  RMDir "$SMPROGRAMS\${PRODUCT_NAME}"
  Delete "$DESKTOP\${PRODUCT_NAME}.lnk"
  RMDir "$INSTDIR"
SectionEnd
