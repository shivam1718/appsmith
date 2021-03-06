import {
  all,
  call,
  put,
  select,
  take,
  takeLatest,
  race,
} from "redux-saga/effects";
import {
  InitializeEditorPayload,
  ReduxAction,
  ReduxActionErrorTypes,
  ReduxActionTypes,
} from "constants/ReduxActionConstants";

import { fetchEditorConfigs } from "actions/configsActions";
import {
  fetchPage,
  fetchPageList,
  fetchPublishedPage,
  setAppMode,
  updateAppStore,
} from "actions/pageActions";
import { fetchDatasources } from "actions/datasourceActions";
import { fetchPlugins } from "actions/pluginActions";
import { fetchActions, fetchActionsForView } from "actions/actionActions";
import { fetchApplication } from "actions/applicationActions";
import AnalyticsUtil from "utils/AnalyticsUtil";
import { getCurrentApplication } from "selectors/applicationSelectors";
import { APP_MODE } from "reducers/entityReducers/appReducer";
import { getAppStore } from "constants/AppConstants";
import { getDefaultPageId } from "./selectors";
import { populatePageDSLsSaga } from "./PageSagas";
import { initEditorError, initViewerError } from "../actions/initActions";

function* initializeEditorSaga(
  initializeEditorAction: ReduxAction<InitializeEditorPayload>,
) {
  const { applicationId, pageId } = initializeEditorAction.payload;
  try {
    yield put(setAppMode(APP_MODE.EDIT));
    yield put({ type: ReduxActionTypes.START_EVALUATION });
    yield all([
      put(fetchPageList(applicationId, APP_MODE.EDIT)),
      put(fetchEditorConfigs()),
      put(fetchActions(applicationId)),
      put(fetchPage(pageId)),
      put(fetchApplication(applicationId, APP_MODE.EDIT)),
    ]);

    const resultOfPrimaryCalls = yield race({
      success: all([
        take(ReduxActionTypes.FETCH_PAGE_LIST_SUCCESS),
        take(ReduxActionTypes.FETCH_PAGE_SUCCESS),
        take(ReduxActionTypes.FETCH_APPLICATION_SUCCESS),
        take(ReduxActionTypes.FETCH_ACTIONS_SUCCESS),
      ]),
      failure: take([
        ReduxActionErrorTypes.FETCH_PAGE_LIST_ERROR,
        ReduxActionErrorTypes.FETCH_PAGE_ERROR,
        ReduxActionErrorTypes.FETCH_APPLICATION_ERROR,
        ReduxActionErrorTypes.FETCH_ACTIONS_ERROR,
      ]),
    });

    if (resultOfPrimaryCalls.failure) {
      yield put(initEditorError());
      return;
    }

    yield all([put(fetchPlugins()), put(fetchDatasources())]);

    const resultOfSecondaryCalls = yield race({
      success: all([
        take(ReduxActionTypes.FETCH_PLUGINS_SUCCESS),
        take(ReduxActionTypes.FETCH_DATASOURCES_SUCCESS),
      ]),
      failure: take([
        ReduxActionErrorTypes.FETCH_PLUGINS_ERROR,
        ReduxActionErrorTypes.FETCH_DATASOURCES_ERROR,
      ]),
    });

    if (resultOfSecondaryCalls.failure) {
      yield put(initEditorError());
      return;
    }

    yield put(updateAppStore(getAppStore(applicationId)));

    const currentApplication = yield select(getCurrentApplication);

    const appName = currentApplication ? currentApplication.name : "";
    const appId = currentApplication ? currentApplication.id : "";

    AnalyticsUtil.logEvent("EDITOR_OPEN", {
      appId: appId,
      appName: appName,
    });

    yield put({
      type: ReduxActionTypes.INITIALIZE_EDITOR_SUCCESS,
    });
  } catch (e) {
    yield put(initEditorError());
    return;
  }

  yield call(populatePageDSLsSaga);
}

export function* initializeAppViewerSaga(
  action: ReduxAction<{ applicationId: string; pageId: string }>,
) {
  const { applicationId, pageId } = action.payload;
  yield put(setAppMode(APP_MODE.PUBLISHED));
  yield put({ type: ReduxActionTypes.START_EVALUATION });
  yield all([
    // TODO (hetu) Remove spl view call for fetch actions
    put(fetchActionsForView(applicationId)),
    put(fetchPageList(applicationId, APP_MODE.PUBLISHED)),
    put(fetchApplication(applicationId, APP_MODE.PUBLISHED)),
  ]);

  const resultOfPrimaryCalls = yield race({
    success: all([
      take(ReduxActionTypes.FETCH_ACTIONS_VIEW_MODE_SUCCESS),
      take(ReduxActionTypes.FETCH_PAGE_LIST_SUCCESS),
      take(ReduxActionTypes.FETCH_APPLICATION_SUCCESS),
    ]),
    failure: take([
      ReduxActionErrorTypes.FETCH_ACTIONS_VIEW_MODE_ERROR,
      ReduxActionErrorTypes.FETCH_PAGE_LIST_ERROR,
      ReduxActionErrorTypes.FETCH_APPLICATION_ERROR,
    ]),
  });

  if (resultOfPrimaryCalls.failure) {
    yield put(initViewerError());
    return;
  }

  yield put(updateAppStore(getAppStore(applicationId)));
  const defaultPageId = yield select(getDefaultPageId);
  const toLoadPageId = pageId || defaultPageId;

  if (toLoadPageId) {
    yield put(fetchPublishedPage(toLoadPageId, true));

    const resultOfFetchPage = yield race({
      success: take(ReduxActionTypes.FETCH_PUBLISHED_PAGE_SUCCESS),
      failure: take(ReduxActionErrorTypes.FETCH_PUBLISHED_PAGE_ERROR),
    });
    if (resultOfFetchPage.failure) {
      yield put(initViewerError());
      return;
    }

    yield put(setAppMode(APP_MODE.PUBLISHED));
    yield put(updateAppStore(getAppStore(applicationId)));

    yield put({
      type: ReduxActionTypes.INITIALIZE_PAGE_VIEWER_SUCCESS,
    });
    if ("serviceWorker" in navigator) {
      yield put({
        type: ReduxActionTypes.FETCH_ALL_PUBLISHED_PAGES,
      });
    }
  }
}

export default function* watchInitSagas() {
  yield all([
    takeLatest(ReduxActionTypes.INITIALIZE_EDITOR, initializeEditorSaga),
    takeLatest(
      ReduxActionTypes.INITIALIZE_PAGE_VIEWER,
      initializeAppViewerSaga,
    ),
  ]);
}
