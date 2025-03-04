import { Contracts } from "@ardenthq/sdk-profiles";
import userEvent from "@testing-library/user-event";
import { createHashHistory } from "history";
import React from "react";
import { Route } from "react-router-dom";

import { WalletHeader } from "./WalletHeader";
import * as useWalletActionsModule from "@/domains/wallet/hooks/use-wallet-actions";
import * as envHooks from "@/app/hooks/env";
import { translations as commonTranslations } from "@/app/i18n/common/i18n";
import * as useQRCodeHook from "@/domains/wallet/components/ReceiveFunds/hooks";
import { translations as walletTranslations } from "@/domains/wallet/i18n";
import { env, getDefaultProfileId, render, screen, waitFor, within } from "@/utils/testing-library";

const history = createHashHistory();

let profile: Contracts.IProfile;
let wallet: Contracts.IReadWriteWallet;

let walletUrl: string;

const clickItem = (label: string) => {
	userEvent.click(screen.getByTestId("dropdown__toggle"));
	userEvent.click(within(screen.getByTestId("dropdown__content")).getByText(label));
};

const closeModal = () => userEvent.click(screen.getByTestId("Modal__close-button"));

describe("WalletHeader", () => {
	beforeAll(async () => {
		profile = env.profiles().findById(getDefaultProfileId());
		wallet = profile.wallets().first();

		await wallet.synchroniser().votes();
		await wallet.synchroniser().identity();
		await wallet.synchroniser().coin();

		walletUrl = `/profiles/${profile.id()}/wallets/${wallet.id()}`;

		jest.spyOn(useQRCodeHook, "useQRCode").mockImplementation(() => ({}));
		jest.spyOn(envHooks, "useActiveProfile").mockReturnValue(profile);
	});

	afterAll(() => {
		useQRCodeHook.useQRCode.mockRestore();
	});

	it("should render", async () => {
		const { asFragment } = render(<WalletHeader profile={profile} wallet={wallet} />);

		await expect(screen.findByText(wallet.address())).resolves.toBeVisible();

		expect(asFragment()).toMatchSnapshot();
	});

	it("should use empty string in clipboard copy if publickey is undefined", async () => {
		const mockpublicKey = jest.spyOn(wallet, "publicKey").mockReturnValue(undefined);
		const { asFragment } = render(<WalletHeader profile={profile} wallet={wallet} />);

		await expect(screen.findByText(wallet.address())).resolves.toBeVisible();

		expect(asFragment()).toMatchSnapshot();

		mockpublicKey.mockRestore();
	});

	it("should render amount for wallet in live network", async () => {
		const mockTestNetwork = jest.spyOn(wallet.network(), "isTest").mockReturnValue(false);
		const { asFragment } = render(<WalletHeader profile={profile} wallet={wallet} />);

		await expect(screen.findByText(wallet.address())).resolves.toBeVisible();

		expect(asFragment()).toMatchSnapshot();

		mockTestNetwork.mockRestore();
	});

	it("should hide second signature option", async () => {
		const mockIsSecondSignature = jest.spyOn(wallet, "isSecondSignature").mockReturnValue(true);
		const mockAllowsSecondSignature = jest.spyOn(wallet.network(), "allows").mockReturnValue(false);

		render(<WalletHeader profile={profile} wallet={wallet} />);

		await expect(screen.findByText(wallet.address())).resolves.toBeVisible();

		userEvent.click(screen.getByTestId("dropdown__toggle"));

		const dropdownContent = screen.getByTestId("dropdown__content");

		await waitFor(() =>
			expect(
				within(dropdownContent).queryByText(walletTranslations.PAGE_WALLET_DETAILS.OPTIONS.SECOND_SIGNATURE),
			).not.toBeInTheDocument(),
		);

		mockIsSecondSignature.mockRestore();
		mockAllowsSecondSignature.mockRestore();
	});

	it("should trigger onSend callback if provided", async () => {
		const handleSend = jest.fn();
		const useWalletActionsSpy = jest.spyOn(useWalletActionsModule, "useWalletActions").mockReturnValue({
			handleSend,
		} as unknown as ReturnType<typeof useWalletActionsModule.useWalletActions>);

		render(<WalletHeader profile={profile} wallet={wallet} />);

		await expect(screen.findByText(wallet.address())).resolves.toBeVisible();

		expect(screen.getByTestId("WalletHeader__send-button")).toBeEnabled();

		userEvent.click(screen.getByTestId("WalletHeader__send-button"));

		expect(handleSend).toHaveBeenCalledWith(expect.objectContaining({ nativeEvent: expect.any(MouseEvent) }));

		useWalletActionsSpy.mockRestore();
	});

	it("send button should be disabled if wallet has no balance", async () => {
		const balanceSpy = jest.spyOn(wallet, "balance").mockReturnValue(0);

		render(<WalletHeader profile={profile} wallet={wallet} />);

		await expect(screen.findByText(wallet.address())).resolves.toBeVisible();

		expect(screen.getByTestId("WalletHeader__send-button")).toBeDisabled();

		balanceSpy.mockRestore();
	});

	it("should show modifiers", async () => {
		const ledgerSpy = jest.spyOn(wallet, "isLedger").mockReturnValue(true);
		const multisigSpy = jest.spyOn(wallet, "isMultiSignature").mockReturnValue(true);

		const { asFragment } = render(<WalletHeader profile={profile} wallet={wallet} />);

		await expect(screen.findByText(wallet.address())).resolves.toBeVisible();

		expect(screen.getByTestId("WalletIcon__Ledger")).toBeInTheDocument();
		expect(screen.getByTestId("WalletIcon__Multisignature")).toBeInTheDocument();
		expect(asFragment()).toMatchSnapshot();

		ledgerSpy.mockRestore();
		multisigSpy.mockRestore();
	});

	it("should hide converted balance if wallet belongs to test network", async () => {
		const networkSpy = jest.spyOn(wallet.network(), "isTest").mockReturnValue(true);

		render(<WalletHeader profile={profile} wallet={wallet} />);

		await expect(screen.findByText(wallet.address())).resolves.toBeVisible();

		expect(screen.queryByTestId("WalletHeader__currency-balance")).not.toBeInTheDocument();

		networkSpy.mockRestore();
	});

	it.each([-5, 5])("should show currency delta (%s%)", (delta) => {
		const { asFragment } = render(<WalletHeader profile={profile} wallet={wallet} currencyDelta={delta} />);

		if (delta < 0) {
			expect(screen.getByText("chevron-down-small.svg")).toBeInTheDocument();
		} else {
			expect(screen.getByText("chevron-up-small.svg")).toBeInTheDocument();
		}

		expect(screen.getByText(`${delta}%`)).toBeInTheDocument();

		expect(asFragment()).toMatchSnapshot();
	});

	it.each(["cancel", "close"])("should open & %s delete wallet modal", async (action) => {
		render(<WalletHeader profile={profile} wallet={wallet} />);

		clickItem(walletTranslations.PAGE_WALLET_DETAILS.OPTIONS.DELETE);

		await waitFor(() =>
			expect(screen.getByTestId("Modal__inner")).toHaveTextContent(walletTranslations.MODAL_DELETE_WALLET.TITLE),
		);

		if (action === "close") {
			closeModal();
		} else {
			userEvent.click(screen.getByText(commonTranslations.CANCEL));
		}

		expect(screen.queryByTestId("Modal__inner")).not.toBeInTheDocument();
	});

	it.each(["cancel", "close"])("should open & %s wallet name modal", async (action) => {
		render(<WalletHeader profile={profile} wallet={wallet} />);

		clickItem(walletTranslations.PAGE_WALLET_DETAILS.OPTIONS.WALLET_NAME);

		await waitFor(() =>
			expect(screen.getByTestId("Modal__inner")).toHaveTextContent(walletTranslations.MODAL_NAME_WALLET.TITLE),
		);

		if (action === "close") {
			closeModal();
		} else {
			userEvent.click(screen.getByText(commonTranslations.CANCEL));
		}

		expect(screen.queryByTestId("Modal__inner")).not.toBeInTheDocument();
	});

	it("should open & close receive funds modal", async () => {
		render(<WalletHeader profile={profile} wallet={wallet} />);

		await expect(screen.findByText(wallet.address())).resolves.toBeVisible();

		clickItem(walletTranslations.PAGE_WALLET_DETAILS.OPTIONS.RECEIVE_FUNDS);

		await waitFor(() =>
			expect(screen.getByTestId("Modal__inner")).toHaveTextContent(walletTranslations.MODAL_RECEIVE_FUNDS.TITLE),
		);

		closeModal();

		expect(screen.queryByTestId("Modal__inner")).not.toBeInTheDocument();
	});

	it("should manually sync wallet data", async () => {
		render(<WalletHeader profile={profile} wallet={wallet} />);

		userEvent.click(screen.getByTestId("WalletHeader__refresh"));

		expect(screen.getByTestId("WalletHeader__refresh")).toHaveAttribute("aria-busy", "true");

		await waitFor(() => expect(screen.getByTestId("WalletHeader__refresh")).toHaveAttribute("aria-busy", "false"));
	});

	it("should handle message signing", () => {
		process.env.REACT_APP_IS_UNIT = "1";
		history.push(walletUrl);

		const historySpy = jest.spyOn(history, "push");

		render(
			<Route path="/profiles/:profileId/wallets/:walletId">
				<WalletHeader profile={profile} wallet={wallet} />
			</Route>,
			{
				history,
				route: walletUrl,
			},
		);

		clickItem(walletTranslations.PAGE_WALLET_DETAILS.OPTIONS.SIGN_MESSAGE);

		expect(historySpy).toHaveBeenCalledWith(`/profiles/${profile.id()}/wallets/${wallet.id()}/sign-message`);

		historySpy.mockRestore();
	});

	it("should handle message verification", () => {
		process.env.REACT_APP_IS_UNIT = "1";
		history.push(walletUrl);

		const historySpy = jest.spyOn(history, "push");

		render(
			<Route path="/profiles/:profileId/wallets/:walletId">
				<WalletHeader profile={profile} wallet={wallet} />
			</Route>,
			{
				history,
				route: walletUrl,
			},
		);

		clickItem(walletTranslations.PAGE_WALLET_DETAILS.OPTIONS.VERIFY_MESSAGE);

		expect(historySpy).toHaveBeenCalledWith(`/profiles/${profile.id()}/wallets/${wallet.id()}/verify-message`);

		historySpy.mockRestore();
	});

	it("should handle multisignature registration", () => {
		process.env.REACT_APP_IS_UNIT = "1";
		history.push(walletUrl);

		const historySpy = jest.spyOn(history, "push");

		render(
			<Route path="/profiles/:profileId/wallets/:walletId">
				<WalletHeader profile={profile} wallet={wallet} />
			</Route>,
			{
				history,
				route: walletUrl,
			},
		);

		clickItem(walletTranslations.PAGE_WALLET_DETAILS.OPTIONS.MULTISIGNATURE);

		expect(historySpy).toHaveBeenCalledWith(
			`/profiles/${profile.id()}/wallets/${wallet.id()}/send-registration/multiSignature`,
		);

		historySpy.mockRestore();
	});

	it("should handle second signature registration", () => {
		history.push(walletUrl);

		const historySpy = jest.spyOn(history, "push");

		render(
			<Route path="/profiles/:profileId/wallets/:walletId">
				<WalletHeader profile={profile} wallet={wallet} />
			</Route>,
			{
				history,
				route: walletUrl,
			},
		);

		clickItem(walletTranslations.PAGE_WALLET_DETAILS.OPTIONS.SECOND_SIGNATURE);

		expect(historySpy).toHaveBeenCalledWith(
			`/profiles/${profile.id()}/wallets/${wallet.id()}/send-registration/secondSignature`,
		);

		historySpy.mockRestore();
	});

	it("should handle delegate registration", () => {
		history.push(walletUrl);

		const historySpy = jest.spyOn(history, "push");

		render(
			<Route path="/profiles/:profileId/wallets/:walletId">
				<WalletHeader profile={profile} wallet={wallet} />
			</Route>,
			{
				history,
				route: walletUrl,
			},
		);

		clickItem(walletTranslations.PAGE_WALLET_DETAILS.OPTIONS.REGISTER_DELEGATE);

		expect(historySpy).toHaveBeenCalledWith(
			`/profiles/${profile.id()}/wallets/${wallet.id()}/send-registration/delegateRegistration`,
		);

		historySpy.mockRestore();
	});

	it("should handle delegate resignation", () => {
		history.push(walletUrl);

		const walletSpy = jest.spyOn(wallet, "isDelegate").mockReturnValue(true);
		const historySpy = jest.spyOn(history, "push");

		render(
			<Route path="/profiles/:profileId/wallets/:walletId">
				<WalletHeader profile={profile} wallet={wallet} />
			</Route>,
			{
				history,
				route: walletUrl,
			},
		);

		clickItem(walletTranslations.PAGE_WALLET_DETAILS.OPTIONS.RESIGN_DELEGATE);

		expect(historySpy).toHaveBeenCalledWith(
			`/profiles/${profile.id()}/wallets/${wallet.id()}/send-delegate-resignation`,
		);

		historySpy.mockRestore();
		walletSpy.mockRestore();
	});

	it("should handle store hash option", () => {
		history.push(walletUrl);

		const historySpy = jest.spyOn(history, "push");

		render(
			<Route path="/profiles/:profileId/wallets/:walletId">
				<WalletHeader profile={profile} wallet={wallet} />
			</Route>,
			{
				history,
				route: walletUrl,
			},
		);

		clickItem(walletTranslations.PAGE_WALLET_DETAILS.OPTIONS.STORE_HASH);

		expect(historySpy).toHaveBeenCalledWith(`/profiles/${profile.id()}/wallets/${wallet.id()}/send-ipfs`);

		historySpy.mockRestore();
	});

	it("should handle isMultiSignature exception", async () => {
		await wallet.synchroniser().identity();

		const multisigSpy = jest.spyOn(wallet, "isMultiSignature").mockImplementationOnce(() => {
			throw new Error("error");
		});

		render(<WalletHeader profile={profile} wallet={wallet} />);

		await expect(screen.findByText(wallet.address())).resolves.toBeVisible();

		expect(screen.queryByTestId("WalletIcon__Multisignature")).not.toBeInTheDocument();

		multisigSpy.mockRestore();
	});

	it("should handle locked balance", async () => {
		const usesLockedBalance = jest.spyOn(wallet.network(), "usesLockedBalance").mockReturnValue(true);
		const balance = jest.spyOn(wallet, "balance").mockReturnValue(10);
		const unlockableBalances = jest
			.spyOn(wallet.coin().client(), "unlockableBalances")
			.mockResolvedValue({ objects: [] } as any);
		const allowsLockedBalance = jest.spyOn(wallet.network(), "allows").mockReturnValue(true);

		const { asFragment } = render(<WalletHeader profile={profile} wallet={wallet} />);

		await expect(screen.findByText(wallet.address())).resolves.toBeVisible();

		expect(screen.getByTestId("WalletHeader__balance-locked")).toHaveTextContent("10");
		expect(asFragment()).toMatchSnapshot();

		userEvent.click(screen.getByTestId("WalletHeader__locked-balance-button"));

		await expect(screen.findByTestId("UnlockTokensModal")).resolves.toBeVisible();

		closeModal();

		await waitFor(() => expect(screen.queryByTestId("UnlockTokensModal")).not.toBeInTheDocument());

		usesLockedBalance.mockRestore();
		balance.mockRestore();
		unlockableBalances.mockRestore();
		allowsLockedBalance.mockRestore();
	});

	it("should handle locked balance when is ledger", async () => {
		const ledgerSpy = jest.spyOn(wallet, "isLedger").mockReturnValue(true);
		const usesLockedBalance = jest.spyOn(wallet.network(), "usesLockedBalance").mockReturnValue(true);
		const balance = jest.spyOn(wallet, "balance").mockReturnValue(10);
		const unlockableBalances = jest
			.spyOn(wallet.coin().client(), "unlockableBalances")
			.mockResolvedValue({ objects: [] } as any);
		const allowsLockedBalance = jest.spyOn(wallet.network(), "allows").mockReturnValue(true);

		const { asFragment } = render(<WalletHeader profile={profile} wallet={wallet} />);

		await expect(screen.findByText(wallet.address())).resolves.toBeVisible();

		expect(screen.getByTestId("WalletHeader__balance-locked")).toHaveTextContent("10");
		expect(asFragment()).toMatchSnapshot();

		userEvent.click(screen.getByTestId("WalletHeader__locked-balance-button"));

		await expect(screen.findByTestId("UnlockTokensModal")).resolves.toBeVisible();

		closeModal();

		await waitFor(() => expect(screen.queryByTestId("UnlockTokensModal")).not.toBeInTheDocument());

		usesLockedBalance.mockRestore();
		balance.mockRestore();
		unlockableBalances.mockRestore();
		allowsLockedBalance.mockRestore();
		ledgerSpy.mockRestore();
	});
});
