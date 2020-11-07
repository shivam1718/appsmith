import React, { Fragment, useEffect, useState } from "react";
import styled from "styled-components";
import { useLocation } from "react-router-dom";
import TagListField from "components/editorComponents/form/fields/TagListField";
import { reduxForm, SubmissionError } from "redux-form";
import SelectField from "components/editorComponents/form/fields/SelectField";
import Divider from "components/editorComponents/Divider";
import { connect, useSelector } from "react-redux";
import { AppState } from "reducers";
import {
  getRolesForField,
  getAllUsers,
  getCurrentOrg,
} from "selectors/organizationSelectors";
import Spinner from "components/editorComponents/Spinner";
import { ReduxActionTypes } from "constants/ReduxActionConstants";
import { InviteUsersToOrgFormValues, inviteUsersToOrg } from "./helpers";
import { INVITE_USERS_TO_ORG_FORM } from "constants/forms";
import {
  INVITE_USERS_SUBMIT_SUCCESS,
  INVITE_USERS_VALIDATION_EMAILS_EMPTY,
  INVITE_USERS_VALIDATION_EMAIL_LIST,
  INVITE_USERS_VALIDATION_ROLE_EMPTY,
} from "constants/messages";
import history from "utils/history";
import { isEmail } from "utils/formhelpers";
import {
  isPermitted,
  PERMISSION_TYPE,
} from "../Applications/permissionHelpers";
import { getAppsmithConfigs } from "configs";
import { ReactComponent as NoEmailConfigImage } from "assets/images/email-not-configured.svg";
import AnalyticsUtil from "utils/AnalyticsUtil";
import Button, { Size } from "components/ads/Button";
import Text, { TextType } from "components/ads/Text";
import Icon, { IconSize } from "components/ads/Icon";
import { Classes, Variant } from "components/ads/common";
import Callout from "components/ads/Callout";
import { getInitialsAndColorCode } from "utils/AppsmithUtils";
import { getThemeDetails } from "selectors/themeSelectors";
import { ProfileImage } from "pages/common/ProfileDropdown";
import { scrollbarDark } from "constants/DefaultTheme";

const OrgInviteTitle = styled.div`
  padding: 10px 0px;
`;

const StyledForm = styled.form`
  width: 100%;
  background: ${props => props.theme.colors.modal.bg};
  &&& {
    .wrapper > div:nth-child(1) {
      width: 60%;
    }
    .wrapper > div:nth-child(2) {
      width: 40%;
    }
    .bp3-input {
      box-shadow: none;
    }
    .bp3-button {
      padding-top: 5px;
    }
  }
`;

const ManageUsers = styled("a")`
  margin-top: 20px;
  display: inline-flex;
  &&&& {
    text-decoration: none;
  }

  .${Classes.TEXT} {
    color: ${props => props.theme.colors.modal.manageUser};
    margin-right: ${props => props.theme.spaces[1]}px;
  }
  .${Classes.ICON} {
    svg path {
      fill: ${props => props.theme.colors.modal.manageUser};
    }
  }

  &:hover {
    .${Classes.TEXT} {
      color: ${props => props.theme.colors.modal.headerText};
    }
    .${Classes.ICON} {
      svg path {
        fill: ${props => props.theme.colors.modal.headerText};
      }
    }
  }
`;

const ErrorBox = styled.div<{ message?: boolean }>`
  ${props => (props.message ? `margin: ${props.theme.spaces[9]}px 0px` : null)};
`;

const StyledInviteFieldGroup = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;

  .wrapper {
    display: flex;
    width: 85%;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    margin-right: 5px;
    border-right: 0px;
  }
`;

const UserList = styled.div`
  margin-top: 10px;
  max-height: 260px;
  overflow-y: auto;
  &&::-webkit-scrollbar-thumb {
    background-color: ${props => props.theme.colors.modal.scrollbar};
  }
  ${scrollbarDark};
`;

const User = styled.div`
  display: flex;
  align-items: center;
  height: 54px;
  padding-left: 15px;
  justify-content: space-between;
  color: ${props => props.theme.colors.modal.user.textColor};
`;

const UserInfo = styled.div`
  display: inline-flex;
  align-items: center;
`;

const UserRole = styled.div`
  flex-basis: 25%;
  .${Classes.TEXT} {
    color: ${props => props.theme.colors.modal.headerText};
  }
`;

const UserName = styled.div`
  display: flex;
  flex-direction: column;
  margin-left: 10px;
  span:nth-child(1) {
    margin-bottom: 1px;
  }
`;

const RoleDivider = styled.div`
  border-top: 1px solid ${props => props.theme.colors.menuBorder};
`;

const Loading = styled(Spinner)`
  padding-top: 10px;
  margin: auto;
  width: 100%;
`;

const MailConfigContainer = styled.div`
  display: flex;
  flex-direction: column;
  padding: ${props => props.theme.spaces[9]}px
    ${props => props.theme.spaces[2]}px;
  align-items: center;
  && > span {
    color: ${props => props.theme.colors.modal.email.message};
    font-weight: 500;
    font-size: 14px;
  }
  && > a {
    color: ${props => props.theme.colors.modal.email.desc};
    font-size: 12px;
    text-decoration: underline;
  }
`;

const validateFormValues = (values: { users: string; role: string }) => {
  if (values.users && values.users.length > 0) {
    const _users = values.users.split(",").filter(Boolean);

    _users.forEach(user => {
      if (!isEmail(user)) {
        throw new SubmissionError({
          _error: INVITE_USERS_VALIDATION_EMAIL_LIST,
        });
      }
    });
  } else {
    throw new SubmissionError({ _error: INVITE_USERS_VALIDATION_EMAILS_EMPTY });
  }

  if (values.role === undefined || values.role?.trim().length === 0) {
    throw new SubmissionError({ _error: INVITE_USERS_VALIDATION_ROLE_EMPTY });
  }
};

const validate = (values: any) => {
  const errors: any = {};
  if (!(values.users && values.users.length > 0)) {
    errors["users"] = INVITE_USERS_VALIDATION_EMAILS_EMPTY;
  }

  if (values.role === undefined || values.role?.trim().length === 0) {
    errors["role"] = INVITE_USERS_VALIDATION_ROLE_EMPTY;
  }

  if (values.users && values.users.length > 0) {
    const _users = values.users.split(",").filter(Boolean);

    _users.forEach((user: string) => {
      if (!isEmail(user)) {
        errors["users"] = INVITE_USERS_VALIDATION_EMAIL_LIST;
      }
    });
  }
  return errors;
};

const { mailEnabled } = getAppsmithConfigs();

const OrgInviteUsersForm = (props: any) => {
  const [emailError, setEmailError] = useState("");

  const {
    handleSubmit,
    allUsers,
    submitting,
    anyTouched,
    submitFailed,
    submitSucceeded,
    error,
    fetchUser,
    fetchAllRoles,
    valid,
    fetchCurrentOrg,
    currentOrg,
    isApplicationInvite,
    isLoading,
  } = props;

  const currentPath = useLocation().pathname;
  const pathRegex = /(?:\/org\/)\w+(?:\/settings)/;

  const userOrgPermissions = currentOrg?.userPermissions ?? [];
  const canManage = isPermitted(
    userOrgPermissions,
    PERMISSION_TYPE.MANAGE_ORGANIZATION,
  );

  useEffect(() => {
    fetchUser(props.orgId);
    fetchAllRoles(props.orgId);
    fetchCurrentOrg(props.orgId);
  }, [props.orgId, fetchUser, fetchAllRoles, fetchCurrentOrg]);

  const styledRoles = props.roles.map((role: any) => {
    return {
      id: role.id,
      value: role.name,
      label: role.description,
    };
  });

  const themeDetails = useSelector(getThemeDetails);

  const allUsersProfiles = React.useMemo(
    () =>
      allUsers.map(
        (user: { username: string; roleName: string; name: string }) => {
          const details = getInitialsAndColorCode(
            user.name || user.username,
            themeDetails.theme.colors.appCardColors,
          );
          return {
            ...user,
            imageBackground: details[1],
            initials: details[0],
          };
        },
      ),
    [allUsers, themeDetails],
  );

  return (
    <>
      {isApplicationInvite && (
        <>
          <Divider />
          <OrgInviteTitle>
            <Text type={TextType.H5}>Invite Users to {currentOrg?.name} </Text>
          </OrgInviteTitle>
        </>
      )}
      <StyledForm
        onSubmit={handleSubmit((values: any, dispatch: any) => {
          validateFormValues(values);
          AnalyticsUtil.logEvent("INVITE_USER", values);
          return inviteUsersToOrg({ ...values, orgId: props.orgId }, dispatch);
        })}
      >
        <StyledInviteFieldGroup>
          <div className="wrapper">
            <TagListField
              name="users"
              placeholder="Enter email address"
              type="email"
              label="Emails"
              intent="success"
              data-cy="t--invite-email-input"
              customError={(err: string) => setEmailError(err)}
            />
            <SelectField
              name="role"
              placeholder="Select a role"
              options={styledRoles}
              size="small"
              outline={false}
              data-cy="t--invite-role-input"
            />
          </div>
          <Button
            tag="button"
            className="t--invite-user-btn"
            disabled={!valid}
            text="Invite"
            size={Size.large}
            variant={Variant.info}
            isLoading={submitting && !(submitFailed && !anyTouched)}
          />
        </StyledInviteFieldGroup>
        {isLoading ? (
          <Loading size={30} />
        ) : (
          <React.Fragment>
            {!mailEnabled && (
              <MailConfigContainer>
                {allUsers.length === 0 && <NoEmailConfigImage />}
                <span>You haven’t setup any email service yet</span>
                <a
                  href="https://docs.appsmith.com/third-party-services/email"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Please configure your email service to invite people
                </a>
              </MailConfigContainer>
            )}
            <UserList style={{ justifyContent: "space-between" }}>
              {allUsersProfiles.map(
                (user: {
                  username: string;
                  name: string;
                  roleName: string;
                  imageBackground: string;
                  initials: string;
                }) => {
                  return (
                    <Fragment key={user.username}>
                      <User>
                        <UserInfo>
                          <ProfileImage backgroundColor={user.imageBackground}>
                            <Text type={TextType.H6} highlight>
                              {user.initials}
                            </Text>
                          </ProfileImage>
                          <UserName>
                            <Text type={TextType.H5}>{user.name}</Text>
                            <Text type={TextType.P2}>{user.username}</Text>
                          </UserName>
                        </UserInfo>
                        <UserRole>
                          <Text type={TextType.P1}>{user.roleName}</Text>
                        </UserRole>
                      </User>

                      <RoleDivider />
                    </Fragment>
                  );
                },
              )}
            </UserList>
          </React.Fragment>
        )}
        <ErrorBox message={submitSucceeded || submitFailed}>
          {submitSucceeded && (
            <Callout
              text={INVITE_USERS_SUBMIT_SUCCESS}
              variant={Variant.success}
              fill
            />
          )}
          {((submitFailed && error) || emailError) && (
            <Callout text={error || emailError} variant={Variant.danger} fill />
          )}
        </ErrorBox>
        {!pathRegex.test(currentPath) && canManage && (
          <ManageUsers
            className="manageUsers"
            onClick={() => {
              history.push(`/org/${props.orgId}/settings/members`);
            }}
          >
            <Text type={TextType.H6}>MANAGE USERS</Text>
            <Icon name="manage" size={IconSize.XXS} />
          </ManageUsers>
        )}
      </StyledForm>
    </>
  );
};

export default connect(
  (state: AppState) => {
    return {
      roles: getRolesForField(state),
      allUsers: getAllUsers(state),
      currentOrg: getCurrentOrg(state),
      isLoading: state.ui.orgs.loadingStates.isFetchAllUsers,
    };
  },
  (dispatch: any) => ({
    fetchAllRoles: (orgId: string) =>
      dispatch({
        type: ReduxActionTypes.FETCH_ALL_ROLES_INIT,
        payload: {
          orgId,
        },
      }),
    fetchCurrentOrg: (orgId: string) =>
      dispatch({
        type: ReduxActionTypes.FETCH_CURRENT_ORG,
        payload: {
          orgId,
        },
      }),
    fetchUser: (orgId: string) =>
      dispatch({
        type: ReduxActionTypes.FETCH_ALL_USERS_INIT,
        payload: {
          orgId,
        },
      }),
  }),
)(
  reduxForm<
    InviteUsersToOrgFormValues,
    {
      fetchAllRoles: (orgId: string) => void;
      roles?: any;
      applicationId?: string;
      orgId?: string;
      isApplicationInvite?: boolean;
    }
  >({
    validate,
    form: INVITE_USERS_TO_ORG_FORM,
  })(OrgInviteUsersForm),
);
