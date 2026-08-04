import { apiClient } from './client';
import type {
  AuthResponse,
  ChangePasswordDto,
  ForgotPasswordDto,
  ForgotPasswordResponse,
  LoginDto,
  RegisterDto,
  RegisterResponse,
  ResetPasswordDto,
  ResetPasswordResponse,
  SecurityQuestion,
  SuccessResponse,
  UpdateSecurityQuestionsDto,
  VerifyAnswersDto,
  VerifyAnswersResponse,
} from './types';

export const authApi = {
  register: async (dto: RegisterDto): Promise<RegisterResponse> => {
    const { data } = await apiClient.post<RegisterResponse>(
      '/auth/register',
      dto,
    );
    return data;
  },

  login: async (dto: LoginDto): Promise<AuthResponse> => {
    const { data } = await apiClient.post<AuthResponse>('/auth/login', dto);
    return data;
  },

  forgotPassword: async (
    dto: ForgotPasswordDto,
  ): Promise<ForgotPasswordResponse> => {
    const { data } = await apiClient.post<ForgotPasswordResponse>(
      '/auth/forgot-password',
      dto,
    );
    return data;
  },

  verifyAnswers: async (
    dto: VerifyAnswersDto,
  ): Promise<VerifyAnswersResponse> => {
    const { data } = await apiClient.post<VerifyAnswersResponse>(
      '/auth/verify-answers',
      dto,
    );
    return data;
  },

  resetPassword: async (
    dto: ResetPasswordDto,
  ): Promise<ResetPasswordResponse> => {
    const { data } = await apiClient.post<ResetPasswordResponse>(
      '/auth/reset-password',
      dto,
    );
    return data;
  },

  getSecurityQuestions: async (): Promise<SecurityQuestion[]> => {
    const { data } = await apiClient.get<SecurityQuestion[]>(
      '/auth/security-questions',
    );
    return data;
  },

  updateSecurityQuestions: async (
    dto: UpdateSecurityQuestionsDto,
  ): Promise<SuccessResponse> => {
    const { data } = await apiClient.put<SuccessResponse>(
      '/auth/security-questions',
      dto,
    );
    return data;
  },

  changePassword: async (dto: ChangePasswordDto): Promise<AuthResponse> => {
    const { data } = await apiClient.post<AuthResponse>(
      '/auth/change-password',
      dto,
    );
    return data;
  },

  refresh: async (refreshToken: string): Promise<AuthResponse> => {
    const { data } = await apiClient.post<AuthResponse>('/auth/refresh', {
      refreshToken,
    });
    return data;
  },

  logout: async (refreshToken: string): Promise<void> => {
    await apiClient.post('/auth/logout', { refreshToken });
  },
};
